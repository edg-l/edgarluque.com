+++
title = "Creating an x86_64 kernel in Rust: Part 4"
description = "Mapping pages with limine's higher half offset, then a kernel heap so alloc works."
date = 2026-08-10T16:00:00Z
[taxonomies]
categories = ["rust", "kernel", "x86_64"]
[extra]
series = "kernel"
series_part = 4
+++

The frame allocator from Part 3 hands out physical frames, but the kernel can't touch one until something maps it to a virtual address. That mapping is the last piece missing before `alloc` works, so by the end of this part `Vec`, `Box` and `String` all do something useful.

[Writing an OS in Rust](https://os.phil-opp.com/) covers this ground too, in [Paging Implementation](https://os.phil-opp.com/paging-implementation/) and [Heap Allocation](https://os.phil-opp.com/heap-allocation/), and it's the thing to read if you want an allocator written from scratch. This part is on limine and its higher half mapping instead of the `bootloader` crate, and I grab a heap allocator from crates.io instead of writing one, which is a whole other post.

Pinned to `limine` 0.6.5, `x86_64` 0.15.5 and `buddy_system_allocator` 0.13 on nightly. The `x86_64` version matters: anything older than 0.15.5 doesn't build on a current nightly.

## Finding the level 4 table

Page tables live at physical addresses. The kernel can only dereference virtual ones. The higher half offset from Part 3 gets us around that: limine already mapped every usable physical page at that offset, so adding it to a physical address gives us something we can actually read.

`CR3` holds the physical frame of the level 4 table:

```rust
// memory/mapper.rs

/// Borrow the active level 4 page table.
///
/// # Safety
///
/// The caller must pass limine's higher half offset, and must not make a second
/// live borrow of the table.
pub unsafe fn active_level_4_table(physical_memory_offset: VirtAddr) -> &'static mut PageTable {
    // CR3 holds the physical frame of the level 4 table.
    let (level_4_table_frame, _) = Cr3::read();

    let phys = level_4_table_frame.start_address();
    // The only way to reach it: limine already mapped all physical memory here.
    let virt = physical_memory_offset + phys.as_u64();
    let page_table_ptr: *mut PageTable = virt.as_mut_ptr();

    unsafe { &mut *page_table_ptr }
}
```

That `&'static mut` isn't really true. Nothing stops a second caller from making another one, and then you have two aliasing mutable references to the same table. We call it once during boot and put the result behind a lock, which is what the next section does. That stops being enough once there's more than one CPU, and that's a later part.

## The mapper

Because limine maps all of physical memory at a fixed offset, translating a physical address to a virtual one is addition. The `x86_64` crate has a type for exactly that case, [`OffsetPageTable`](https://docs.rs/x86_64/latest/x86_64/structures/paging/mapper/struct.OffsetPageTable.html), so we don't have to walk the tables by hand.

{{ page_walk() }}

```rust
// memory/mapper.rs

pub struct MemoryManager {
    pub mapper: OffsetPageTable<'static>,
}

static MEMORY_MANAGER: Once<Mutex<MemoryManager>> = Once::new();

/// Returns a lock guard to the kernel's memory manager.
#[must_use]
pub fn memory_mapper() -> MutexGuard<'static, MemoryManager> {
    MEMORY_MANAGER.get().unwrap().lock()
}

pub fn init_memory_manager() {
    let physical_memory_offset = boot_info().physical_memory_offset;

    let level_4_table = unsafe { active_level_4_table(physical_memory_offset) };
    let mapper = unsafe { OffsetPageTable::new(level_4_table, physical_memory_offset) };

    MEMORY_MANAGER.call_once(|| Mutex::new(MemoryManager { mapper }));
}
```

`OffsetPageTable::new` is unsafe because it believes the offset you give it. Hand it the wrong one and every translation it does afterwards is garbage, silently.

## What's in an entry

Part 1 covered the shape of the walk, 512 entries per table, 9 bits of the address picking one of them. It never said what an entry actually looks like inside, and the code below starts setting flags, so here it is.

{{ page_table_entry() }}

Bits 12 to 51 are a physical address. On the top three levels it's the address of the next table down, on the last level it's the frame you're mapping. Everything else is flags, and these are the ones that matter here:

- **PRESENT** (bit 0): the entry means anything at all. Clear it and touching the page faults.
- **WRITABLE** (bit 1): writes are allowed. A present page without it is read-only.
- **USER_ACCESSIBLE** (bit 2): ring 3 can touch it. Everything in this part is kernel memory so it stays clear, and userspace is a later part.
- **GLOBAL** (bit 8): the CPU keeps this translation when `CR3` is reloaded instead of flushing it along with everything else. There is a catch: the bit does nothing unless `CR4.PGE` is set, and limine hands over with `PGE` clear. So setting it on kernel mappings is right, and it buys you exactly nothing until you turn `PGE` on yourself.
- **NO_EXECUTE** (bit 63): fetching instructions from the page faults.

ACCESSED (bit 5) and DIRTY (bit 6) are written by the CPU rather than by you. You clear them, and later you read them back to find out whether anything touched or wrote that page, which is what page reclaim needs to pick a victim. PS (bit 7) turns a mid-level entry into a 2 MiB or 1 GiB page instead of a pointer to the next table, and this series sticks to 4 KiB. PWT and PCD (bits 3 and 4) are cache control, and they matter for device memory rather than RAM.

Bits 9 to 11 and 52 to 58 are yours. The CPU ignores them, so the kernel can keep its own bookkeeping inside the entry. Mine uses bit 9 to mark a page copy-on-write, which is how the fault handler tells a real permission error apart from a page that just needs copying before the write goes through.

## Mapping a range

`map_to` is where it happens, and it does more than write one entry. Look at the diagram again: to map one 4 KiB page, the level 3, 2 and 1 tables on the path all have to exist. Usually they don't. So `map_to` allocates frames for the ones that are missing, which is why it takes a `FrameAllocator` as an argument. Our bitmap allocator from Part 3 already implements that trait.

First, the pages a range touches:

```rust
// memory/mapper.rs

/// Every page touched by `size` bytes starting at `addr`.
pub fn get_page_range(addr: VirtAddr, size: u64) -> PageRangeInclusive<Size4KiB> {
    let start_page = Page::containing_address(addr);
    // The address of the last byte, not one past it.
    let end_page = Page::containing_address(VirtAddr::new(addr.as_u64() + size - 1));

    Page::range_inclusive(start_page, end_page)
}
```

Then the mapping itself:

```rust
impl MemoryManager {
    /// Map `size` bytes at `addr`. `PRESENT` is always set, pass the rest.
    pub fn map_memory(
        &mut self,
        addr: VirtAddr,
        size: u64,
        extra_flags: PageTableFlags,
    ) -> Result<PageRangeInclusive<Size4KiB>, MapToError<Size4KiB>> {
        let page_range = get_page_range(addr, size);
        let flags = PageTableFlags::PRESENT | extra_flags;

        // Take the frame allocator once and keep it for the whole loop, because
        // map_to allocates out of it too.
        let mut frame_allocator = frame_allocator();

        for page in page_range {
            let frame = frame_allocator
                .allocate_frame()
                .ok_or(MapToError::FrameAllocationFailed)?;

            unsafe {
                self.mapper
                    .map_to(page, frame, flags, &mut *frame_allocator)?
                    .flush()
            };
        }

        Ok(page_range)
    }
}
```

We take the frame allocator guard once, outside the loop, and pass `&mut *frame_allocator` straight into [`map_to`](https://docs.rs/x86_64/latest/x86_64/structures/paging/mapper/trait.Mapper.html#tymethod.map_to). The allocations `map_to` makes for intermediate tables come out of the same guard we're already holding, so nothing tries to lock it twice.

And [`map_to`](https://docs.rs/x86_64/latest/x86_64/structures/paging/mapper/trait.Mapper.html#tymethod.map_to) returns a [`MapperFlush`](https://docs.rs/x86_64/latest/x86_64/structures/paging/mapper/struct.MapperFlush.html), which does nothing until you call `.flush()` on it. Until then the entry is in the page table but the CPU may still be serving the old translation from its TLB. It's `#[must_use]`, so forgetting it is a warning rather than a mapping that mysteriously isn't there yet.

`PageTableFlags::NO_EXECUTE` is safe to use here without touching `EFER` yourself, because limine already turned NX on before handing over control. Its [protocol](https://github.com/limine-bootloader/limine-protocol/blob/trunk/PROTOCOL.md) spells the entry state out: "NX is enabled (`EFER`) (if it is available)".

## Where the heap goes

The heap needs a virtual range, and we pick it by hand. It has to be in the kernel half of the address space, it must not collide with the higher half mapping limine gave us, and there should be room after it, because a fixed heap is a heap you will resize later.

```rust
// memory/mod.rs

/// Kernel heap, in the kernel half of the address space.
pub const KERNEL_HEAP: VirtAddr = VirtAddr::new_truncate(0xFFFF_C000_0000_0000);
pub const KERNEL_HEAP_SIZE: u64 = 1024 * 1024; // 1 MiB
```

1 MiB is small on purpose. It's enough for the kernel to start using collections, and small enough that you hit the growth problem early, while the kernel is still simple enough to fix it. `KERNEL_HEAP_SIZE` is the one dial here, and my own kernel still starts at this number.

The size matters less than what sits after it. I keep the next region a long way up, at `0xFFFF_C000_2000_0000`, so the heap has half a gigabyte of untouched virtual address space above it to grow into. Virtual address space is cheap, so leaving a gap costs you nothing until the day you need it.

## A global allocator

Writing an allocator is a separate subject and a good one, but not this one. [`buddy_system_allocator`](https://docs.rs/buddy_system_allocator/) has a `LockedHeap` that already implements [`GlobalAlloc`](https://doc.rust-lang.org/core/alloc/trait.GlobalAlloc.html), so the work here is handing it memory.

```toml
buddy_system_allocator = "0.13.0"
```

```rust
// allocator.rs

use buddy_system_allocator::LockedHeap;
use x86_64::structures::paging::PageTableFlags;

use crate::memory::{KERNEL_HEAP, KERNEL_HEAP_SIZE, mapper::memory_mapper};

#[global_allocator]
static ALLOCATOR: LockedHeap<32> = LockedHeap::empty();

pub fn init_heap() {
    memory_mapper()
        .map_memory(
            KERNEL_HEAP,
            KERNEL_HEAP_SIZE,
            // GLOBAL only bites once CR4.PGE is on, which limine leaves off.
            // Correct to set anyway, the heap is in every address space.
            PageTableFlags::WRITABLE | PageTableFlags::GLOBAL,
        )
        .expect("failed to map the kernel heap");

    unsafe {
        ALLOCATOR
            .lock()
            .init(KERNEL_HEAP.as_u64() as usize, KERNEL_HEAP_SIZE as usize);
    }
}
```

Map first, then tell the allocator about the range. Do it the other way around and the first allocation faults.

A buddy allocator rather than a bump allocator because it actually reclaims what you free, and rather than a linked list one because splitting and merging power-of-two blocks keeps both operations logarithmic. The `32` is the order, so the largest block it will serve is 2<sup>31</sup> bytes.

## `Vec` works

Add `extern crate alloc;` to `main.rs` and the collections are available. `alloc` ships with the toolchain, there's nothing to add to `Cargo.toml` for it.

```rust
// main.rs

extern crate alloc;

use alloc::{string::String, vec::Vec};

use crate::{
    allocator::init_heap,
    memory::{
        frame_allocator::{frame_allocator, init_frame_allocator},
        mapper::init_memory_manager,
    },
};

fn init() {
    let info = boot_info();

    serial_println!("Initializing the frame allocator");
    init_frame_allocator(info.memory_map);

    serial_println!("Initializing the memory manager");
    init_memory_manager();

    serial_println!("Initializing the kernel heap");
    init_heap();

    serial_println!("Init done");
}

fn main() -> ! {
    serial_println!("Booting...");
    init();

    // The heap's frames, plus whatever map_to needed for intermediate tables,
    // now show up as allocated.
    let stats = frame_allocator().stats();
    serial_println!("Frames: {} total", stats.total_frames);
    serial_println!("  free:      {}", stats.free_frames);
    serial_println!("  allocated: {}", stats.allocated_frames);

    let mut squares: Vec<u64> = Vec::new();
    for i in 0..8 {
        squares.push(i * i);
    }
    serial_println!("A Vec on the heap: {squares:?}");

    let mut s = String::from("and a String, ");
    s.push_str("grown after the fact");
    serial_println!("{s}");

    loop {
        hlt();
    }
}
```

The test allocation from Part 3 is gone, so `deallocate_frame` has nothing calling it now and the compiler will say so. Put an `#[expect(unused)]` on it. The next part gives frames back for real.

On a 2 GiB machine:

```
Booting...
Initializing the frame allocator
Initializing the memory manager
Initializing the kernel heap
Init done
Frames: 524022 total
  free:      522881
  allocated: 1141
A Vec on the heap: [0, 1, 4, 9, 16, 25, 36, 49]
and a String, grown after the fact
```

1141 allocated frames is about 4.5 MiB, and most of it isn't the heap. 256 of those frames are the 1 MiB we just mapped, 16 hold the frame bitmap itself, and the rest are the kernel image, the bootloader's own structures, the reserved regions inside the range, and the handful of frames `map_to` took for intermediate page tables.

## What this costs later

Two decisions in this part come back.

The first is that lock. `map_to` allocates, so the frame allocator has to be reachable from inside the mapping loop, and we handled that by holding the guard and passing it down. The other design is tempting and it deadlocks: if the allocator you pass to `map_to` goes and locks the global frame allocator itself, then the first time a level 3 table is missing you try to acquire a spinlock you're already holding. `spin::Mutex` isn't reentrant, so it doesn't panic, it just spins there forever. Thread the guard through instead. In my kernel this eventually turned into an explicit lock ranking, where the mapper and the frame allocator have fixed ranks and taking them out of order panics immediately rather than hanging.

The second is that 1 MiB. It runs out. The fix isn't a bigger constant, it's expanding: reserve the virtual range now, map more of it when the allocator can't satisfy a request, and hand the new pages to the heap. Mine grows in 1 MiB steps. That only works because nothing was mapped right after the range, which is why the address is worth a minute of thought and not just the size.

There's a third one further out. A single lock in front of the whole heap is fine for one core and becomes the contended thing on four. You end up putting per-CPU caches in front of it for the small sizes. Not a problem you have yet.

Next part is interrupts and the page fault handler, which is where mapping stops being something you do up front and starts being something that happens because a program touched an address.
