+++
title = "How Block Access Lists are implemented in ethrex"
description = "A walkthrough of EIP-7928 Block Access Lists inside the ethrex execution client: data structures, the recorder, revert semantics, net-zero filtering, and the three optimizations BAL enables on the validator path."
date = 2026-05-23
[taxonomies]
categories = ["rust", "evm", "performance"]
+++

A [Block Access List](https://eips.ethereum.org/EIPS/eip-7928) is a structured, per-block record of every account and storage slot touched during execution, with the post-execution values. The top-level shape is `List[AccountChanges]`, one entry per touched address. It lives in two places: a new `block_access_list_hash` field in the block header (`keccak256(rlp.encode(bal))`), and the BAL itself transmitted alongside the block via the Engine API.

A BAL exists because of what it lets a validator do: prefetch state without speculating, execute transactions in parallel with disjoint per-tx views, and merkleize the post-state root concurrently with the EVM. All three are possible because the BAL declares up front what the block will touch and what each touch will produce. This post is the anatomy of how ethrex implements both sides: producing a BAL while executing a block, and consuming a BAL to validate one in parallel.

Most of the code referenced below is in [`crates/common/types/block_access_list.rs`](https://github.com/lambdaclass/ethrex/blob/main/crates/common/types/block_access_list.rs) and [`crates/common/validation.rs`](https://github.com/lambdaclass/ethrex/blob/main/crates/common/validation.rs), with the parallel execution wiring in [`crates/vm/backends/levm/mod.rs`](https://github.com/lambdaclass/ethrex/blob/main/crates/vm/backends/levm/mod.rs).

Pinned to ethrex `main` at commit `c0995b947` and bal-devnet-7. The EIP and ethrex are both in active development.

## The data structures

Reading the types top-down is the fastest way in. The top of the tree is `BlockAccessList`, just a vector of per-address entries:

```rust
pub struct BlockAccessList {
    inner: Vec<AccountChanges>,
}
```

Each `AccountChanges` is an address plus five vectors, one per kind of touch:

```rust
pub struct AccountChanges {
    pub address: Address,
    pub storage_changes: Vec<SlotChange>,
    pub storage_reads: Vec<U256>,
    pub balance_changes: Vec<BalanceChange>,
    pub nonce_changes: Vec<NonceChange>,
    pub code_changes: Vec<CodeChange>,
}
```

The split between `storage_changes` and `storage_reads` matters: a read is a slot that was loaded but not written, a change is a slot that was written. Same for everything else, except reads only exist for storage. Touching an address with no state change still puts the address in the BAL with empty vectors.

The leaf types are all "block access index + post-state value" pairs:

```rust
pub struct StorageChange {
    pub block_access_index: u32,
    pub post_value: U256,
}

pub struct BalanceChange {
    pub block_access_index: u32,
    pub post_balance: U256,
}

pub struct NonceChange {
    pub block_access_index: u32,
    pub post_nonce: u64,
}

pub struct CodeChange {
    pub block_access_index: u32,
    pub new_code: Bytes,
}
```

`SlotChange` groups changes by slot:

```rust
pub struct SlotChange {
    pub slot: U256,
    pub slot_changes: Vec<StorageChange>,
}
```

The recurring rule across all of them: post-state only. The EIP is explicit: "If a storage slot's value is changed but its post-transaction value is equal to its pre-transaction value, the slot MUST NOT be recorded as modified." That rule sounds simple. It isn't.

## The recorder

The BAL is not built incrementally by executing the EVM and appending. It's built by feeding execution events into a `BlockAccessListRecorder`, which accumulates everything, and consuming it at the end of the block:

```rust
pub struct BlockAccessListRecorder {
    current_index: u32,
    touched_addresses: IndexSet<Address>,
    storage_reads: IndexMap<Address, IndexSet<U256>>,
    storage_writes: BTreeMap<Address, BTreeMap<U256, Vec<(u32, U256)>>>,
    initial_balances: IndexMap<Address, U256>,
    tx_initial_storage: BTreeMap<(Address, U256), U256>,
    tx_initial_code: BTreeMap<Address, Bytes>,
    balance_changes: BTreeMap<Address, Vec<(u32, U256)>>,
    nonce_changes: BTreeMap<Address, Vec<(u32, u64)>>,
    code_changes: BTreeMap<Address, Vec<(u32, Bytes)>>,
    addresses_with_initial_code: IndexSet<Address>,
    reads_promoted_to_writes: BTreeMap<Address, Vec<U256>>,
    in_system_call: bool,
}
```

The choice of `IndexSet` and `IndexMap` over `BTreeMap` for some fields isn't aesthetic. It's for the revert mechanism below: those types let us snapshot a length and truncate back to it, instead of cloning the whole structure per call frame.

The lifecycle looks like this:

1. `new()` at the start of the block.
2. `set_block_access_index(0)` for the pre-execution system contracts (EIP-2935 history, EIP-4788 beacon root, etc.).
3. For each transaction `i` (1-indexed), `set_block_access_index(i)`, then execute the tx, with the EVM calling `record_storage_read`, `record_storage_write`, `record_balance_change`, etc.
4. `set_block_access_index(n+1)` for post-execution (withdrawals).
5. Consume the recorder into the final `BlockAccessList`.

The EVM doesn't care about BAL. It just emits access events. The recorder is the only thing that knows about block access indices, ordering, or filtering.

## Revert semantics and checkpoints

The EIP says: "State changes from reverted calls are discarded, but all accessed addresses must be included." This sounds like a footnote and is actually the most annoying part of the implementation.

The distinction is: *touches* persist across reverts, *state changes* don't. If a `CALL` revert undoes a write, the slot still needs to appear in the BAL (because the SLOAD happened), but as a read, not a write. The recorder needs to be able to roll back exactly the state-change parts while keeping touched addresses and read sets intact.

ethrex uses two checkpoint types. The first is for inner-call reverts:

```rust
pub struct BlockAccessListCheckpoint {
    reads_promoted_len: BTreeMap<Address, usize>,
    storage_writes_len: BTreeMap<Address, BTreeMap<U256, usize>>,
    balance_changes_len: BTreeMap<Address, usize>,
    nonce_changes_len: BTreeMap<Address, usize>,
    code_changes_len: BTreeMap<Address, usize>,
}
```

Notice what's missing: there's no `touched_addresses_len` here, and no `storage_reads`. Both persist across the revert. The checkpoint only captures *lengths*, and restoring it truncates each vector back to its captured size. No cloning of the recorder, no copying of state. Take a checkpoint before a `CALL`, restore it on revert.

The second checkpoint is for a different case: a transaction during block building that fails validation entirely (gas underpriced after re-execution, etc.) and needs to be fully erased from the recorder:

```rust
pub struct TxCheckpoint {
    inner: BlockAccessListCheckpoint,
    current_index: u32,
    touched_addresses_len: usize,
    storage_reads_lens: IndexMap<Address, usize>,
    initial_balances_len: usize,
    addresses_with_initial_code_len: usize,
}
```

This one *does* capture touched addresses and read lengths, because for a fully-rejected tx, those touches shouldn't exist either. Same trick: lengths only, restore is `truncate()` and `Vec::resize()`.

The reason both are length-based and not copy-based: a tx can have hundreds of call frames. Cloning the recorder per frame would tip a state-heavy block into OOM. Lengths are O(addresses_changed) per checkpoint, restore is O(items_to_drop).

## Net-zero filtering

Back to the EIP rule: "If a storage slot's value is changed but its post-transaction value is equal to its pre-transaction value, the slot MUST NOT be recorded as modified."

This is a per-transaction rule, not per-call. You can write `slot[k] = 5` then `slot[k] = 0` (its original value) within the same tx and the BAL should show no storage change. You also can't just suppress the write at write-time, because you don't know the final value until the tx is done.

The recorder solves this with `tx_initial_storage`: a `BTreeMap<(Address, U256), U256>` capturing the pre-tx value of every slot first written during the current tx. When `set_block_access_index` is called to move to the next transaction, `filter_net_zero_storage` runs:

```rust
fn filter_net_zero_storage(&mut self) {
    let current_idx = self.current_index;
    let mut slots_to_convert: Vec<(Address, U256)> = Vec::new();

    for ((addr, slot), pre_value) in &self.tx_initial_storage {
        if let Some(slots) = self.storage_writes.get(addr)
            && let Some(changes) = slots.get(slot)
        {
            let final_value = changes
                .iter()
                .filter(|(idx, _)| *idx == current_idx)
                .next_back()
                .map(|(_, val)| *val);

            if let Some(final_val) = final_value
                && final_val == *pre_value
            {
                slots_to_convert.push((*addr, *slot));
            }
        }
    }

    for (addr, slot) in slots_to_convert {
        // remove the write entries, undo any read-to-write promotion,
        // and re-insert as a read
        // ...
        self.storage_reads.entry(addr).or_default().insert(slot);
    }
}
```

The subtle part is the last step: a net-zero write doesn't disappear, it *downgrades* to a read. The slot was still touched. If the slot was already a read that got promoted to a write earlier in the tx (because of an SSTORE), we have to undo the promotion too. There's a parallel `filter_net_zero_code` doing the same dance for code changes (delegate then reset in one tx should produce no code change).

This is one of those rules that is easy to read in the EIP and then takes three review rounds to get right in code.

## Block access index semantics

Every change in the BAL has an index. The indices are not just transaction numbers; they encode the execution phase:

{{ bal_index_timeline() }}

```rust
/// # Block Access Index Semantics
/// - 0: System contracts (pre-execution phase)
/// - 1..n: Transaction indices (1-indexed)
/// - n+1: Post-execution phase (withdrawals)
```

System contract calls happen at index 0: EIP-2935 (historical block hashes), EIP-4788 (beacon block root). Withdrawals happen at index n+1, after all transactions. Validation rejects any BAL whose indices exceed `n+1`.

This is also where `in_system_call` shows up in the recorder. System contracts touch `SYSTEM_ADDRESS` for their bookkeeping, but the spec says those touches shouldn't appear in the BAL. The recorder filters them out while `in_system_call = true`.

## Two execution paths

So far everything I've described, the recorder, the checkpoints, the net-zero filter, is the *builder* side: an execution flow that produces a BAL from scratch. ethrex has a second flow that doesn't build a BAL at all, and that flow is the entire reason BAL exists.

The builder is sequential: execute transactions, record accesses through the recorder, consume the recorder, set the BAL hash in the produced header. The result is the canonical BAL for that block. Encoding is enforced through `encode_sorted_by` so two builders that observe the same accesses produce byte-identical RLP and therefore the same hash.

The validator path is different. When the consensus layer hands ethrex a block through `engine_newPayloadV5`, the BAL comes alongside as part of the execution payload. The validator then runs three things in parallel via `std::thread::scope`: a warmer that prefetches everything the BAL declares, the EVM executing transactions in parallel using the BAL to scope per-tx state, and a merkleizer that computes the post-state root from the BAL without waiting for execution to finish. There's no `produced_bal` on this path; the input BAL is the ground truth.

{{ bal_parallel_scope() }}

### Deterministic prewarm

Without a BAL, the only way to prewarm state is to guess what the EVM will touch. ethrex's fallback warmer does this by speculatively re-executing transactions in parallel, grouped by sender (Nethermind's trick: same-sender txs sequentially, different senders in parallel). It's an educated guess. Sometimes wrong, often wasteful.

With a BAL, the guess is replaced by a list. `warm_block_from_bal` walks the BAL and prefetches in two phases: every account first (which warms the trie layer cache), then every storage slot and bytecode (which benefit from the trie nodes already cached in phase one). No re-execution, no speculation, exact set.

```rust
pub fn warm_block_from_bal(
    bal: &BlockAccessList,
    store: Arc<dyn Database>,
    cancelled: &AtomicBool,
) -> Result<(), EvmError> {
    let account_addresses: Vec<Address> = bal.accounts().iter().map(|ac| ac.address).collect();
    store.prefetch_accounts(&account_addresses)?;
    // phase 2: parallel per-slot storage + per-account code prefetch
    // ...
}
```

The warmer runs on its own thread inside the scope. If it falls behind the EVM, the EVM does the IO itself; the prewarm is opportunistic, not a barrier.

### Parallel transaction execution

The BAL declares exactly what each transaction will touch, so each transaction can execute against a database view that contains only its declared subset. The mechanism is `LazyBalCursor`: each per-tx database holds a cursor into the BAL scoped to that tx's `block_access_index`. When the EVM calls `get_storage_value` or `load_account`, the cursor lazily materializes that single slot or account from the BAL overlay, not the whole tx's slice.

That keeps per-tx seeding cost at O(touched-by-this-tx) instead of O(BAL). It also means cross-tx interference is impossible by construction: if two txs touch the same slot, the later tx's cursor resolves to the earlier tx's post-value, copied into its scoped view; there's no shared mutable reference.

While the txs run in parallel, a shadow recorder per tx notes which addresses and slots the EVM actually touched. Two block-wide sets, `unread_storage_reads` and `unaccessed_pure_accounts`, are seeded from the BAL up front. Each tx's shadow recorder removes the entries it satisfied. After all txs, withdrawals, and request extraction have run, both sets must be empty. If they aren't, the BAL claimed something that didn't happen, and the block is rejected. The reverse direction is enforced by construction: an EVM access for a slot the BAL didn't list can't be satisfied by the scoped view, so the block fails as soon as the missing access surfaces.

### Optimistic merkleization

Computing the post-state root is usually the dominant cost after EVM execution finishes. With a BAL, you don't need to wait. The BAL declares every post-state value: last `BalanceChange.post_balance`, last `NonceChange.post_nonce`, last `CodeChange.new_code`, last `StorageChange.post_value` per slot. That's enough to drive trie updates.

`synthesize_bal_updates` collapses the BAL into a per-account map of field-level deltas:

```rust
pub struct BalSynthesisItem {
    pub balance: Option<U256>,
    pub nonce: Option<u64>,
    pub code_hash: Option<H256>,
    pub code: Option<Code>,
    pub added_storage: FxHashMap<H256, U256>,
}

pub fn synthesize_bal_updates(bal: &BlockAccessList) -> FxHashMap<Address, BalSynthesisItem> {
    // ... last() of each change vector, per account
}
```

The merkleizer thread takes this map and starts trie work the moment block execution begins, in parallel with the EVM. Two gates guard the result: (1) every BAL entry must be accessed (the `unread_storage_reads` + `unaccessed_pure_accounts` check above), and (2) the computed state root must equal `header.state_root`. If either fails, the optimistic merkle output is discarded.

Accounts that appear in the BAL only via `storage_reads` (no actual changes) are skipped: their trie state is unchanged, so there's nothing for the merkleizer to do for them.

### The cheap checks both paths share

`validate_header_bal_indices` rejects any BAL with an index > `n+1`. `BAL_ITEM_COST = 2000` caps total items at `gas_limit / 2000` (15,000 for a 30M gas block) as a DoS bound. These run early on both paths so a bogus BAL fails fast.

The split is the architectural point: building a BAL is sequential and easy to reason about; validating one parallelizes three expensive things at once (prefetch, execution, merkleization) because the BAL itself tells each of them what to do.

If you want to read the source: [`block_access_list.rs`](https://github.com/lambdaclass/ethrex/blob/main/crates/common/types/block_access_list.rs), [`validation.rs`](https://github.com/lambdaclass/ethrex/blob/main/crates/common/validation.rs), and [`vm/backends/levm/mod.rs`](https://github.com/lambdaclass/ethrex/blob/main/crates/vm/backends/levm/mod.rs) in [ethrex](https://github.com/lambdaclass/ethrex), and the [EIP](https://eips.ethereum.org/EIPS/eip-7928) itself.
