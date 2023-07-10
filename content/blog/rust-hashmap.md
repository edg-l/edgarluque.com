+++
title = "Implementing a simple Hashmap in Rust"
description = "A quick dive into how a hash map works."
date = 2023-07-10
[taxonomies]
categories = ["rust", "data structures"]
+++

Have you ever wondered how a hash map works internally?

The idea is quite simple: you map a key to a value, but how do you do that efficiently? This is where hashes come into play.

You get a key, then hash it, which gives you an integer value, but we want to map that value into an index inside the backing storage, so you need to calculate the number modulo the current capacity of the backing storage.

Since hashing is involved, and we modulo the hash result to the capacity, there will be collisions. One way to deal with collisions is called [**Open addressing**](https://en.wikipedia.org/wiki/Open_addressing).

## Storage

We will use an array as the backing storage for our hashmap. The slots of this array will either be nothing or a key value pair. So in Rust it would be a `Option<(K, V)>`.

```rust
#[derive(Debug, Clone)]
pub struct MyHashmap<K, V, S = RandomState> {
    // Our storage
    storage: Vec<Option<(K, V)>>,
    // Save the length for quick querying
    len: usize,
    // The hasher.
    state: S,
    // Wehther to use quadratic or linear probing.
    quadratic: bool,
}
```

Here `state` is a structure that will help to hash the keys.

We add some basic utility methods:

```rust
impl<K, V, S> MyHashmap<K, V, S> {
    pub fn new(hasher: S, quadratic: bool) -> Self {
        Self {
            storage: (0..8).map(|_| None).collect(),
            len: 0,
            state: hasher,
            quadratic
        }
    }

    pub const fn len(&self) -> usize {
        self.len
    }

    pub const fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub const fn is_quadratic(&self) -> bool {
        self.quadratic
    }

    fn should_resize(&self) -> bool {
        (self.len as f64 / self.storage.len() as f64) > 0.7
    }
}
```

You may wonder why there are no trait bounds in this impl block, like `K: Hash`, and this is because it's usually better to only put the trait
bounds in impl blocks where you use them. The standard library does this extensively (from what i have seen).

## Load factor

For the hashmap to perfom well, it needs to keep a good load factor.

The load factor is defined as:

`load factor = number of entries / number of slots`

According to some [papers](https://dl.acm.org/doi/10.1145/356643.356645) when the load factor aproaches 0.7-0.8 it should be resized.

## Probing / Searching

When searching for a slot, either at insertion or search, we will need to do something when a hash colision happens:

### Linear probing

Let `x` be the value of `hash(key) (mod capacity)`.

Starting with `i = 0`:

- If the slot `x + i (mod capacity)` is unused, use it.
- If the slot `x + i (mod capacity)` is used, check if the key matches:
- - If the key matches, use it.
- - If the key doesn't match, repeat the probing with `i += OFFSET`, offset usually being 1.

```rust
impl<K, V, S> MyHashmap<K, V, S>
where
    K: Eq + Hash,
    S: BuildHasher,
{
    // Should be called with a sensible load factor.
    fn find_slot_linear(&self, key: &K) -> &Option<(K, V)> {
        let mut hasher = self.state.build_hasher();
        key.hash(&mut hasher);
        let start_idx = hasher.finish() as usize;
        let mut iter_idx = 0;
        let len = self.storage.len();

        let slot_idx = loop {
            let idx_mod: usize = (start_idx + iter_idx) % len;
            match &self.storage[idx_mod] {
                Some(kv) if kv.0.eq(key) => break idx_mod,
                None => break idx_mod,
                _ => {
                    iter_idx += 1;

                    assert!(
                        iter_idx <= len,
                        "find_slot called without a matching key and full storage!"
                    );
                }
            }
        };

        &self.storage[slot_idx]
    }
}
```

### Quadratic probing

It works by taking successive values of an arbitrary [quadratic polynomial](https://en.wikipedia.org/wiki/Quadratic_probing).

We will use `hash(key) + (i + i^2) / 2`.

Let `x` be the value of `hash(key) (mod capacity)`.

Starting with `i = 0`:

- If the slot `x + (i + i^2) / 2 (mod capacity)` is unused, use it.
- If the slot `x + (i + i^2) / 2 (mod capacity)` is used, check if the key matches:
- - If the key matches, use it.
- - If the key doesn't match, repeat the probing with `i += OFFSET`, offset usually being 1.

```rust
impl<K, V, S> MyHashmap<K, V, S>
where
    K: Eq + Hash,
    S: BuildHasher,
{
    // Should be called with a sensible load factor.
    fn find_slot_quadratic(&self, key: &K) -> &Option<(K, V)> {
        let mut hasher = self.state.build_hasher();
        key.hash(&mut hasher);
        let start_idx = hasher.finish() as usize;
        let mut iter_idx: usize = 0;
        let len = self.storage.len();

        let slot_idx = loop {
            let idx_mod: usize = (start_idx + (iter_idx + iter_idx.pow(2)) / 2) % len;
            match &self.storage[idx_mod] {
                Some(kv) if kv.0.eq(key) => break idx_mod,
                None => break idx_mod,
                _ => {
                    iter_idx += 1;

                    assert!(
                        iter_idx <= len,
                        "find_slot called without a matching key and full storage!"
                    );
                }
            }
        };

        &self.storage[slot_idx]
    }
}
```

A mutable version of both linear and quadratic methods should be made for insertion.

```rust
impl<K, V, S> MyHashmap<K, V, S>
where
    K: Eq + Hash,
    S: BuildHasher,
{
    fn find_slot_linear_mut(&mut self, key: &K) -> &mut Option<(K, V)> {
        /// ... same code

        &mut self.storage[slot_idx] // mut ref
    }
}
```

## Inserting

To insert a key value pair, we need to do the following:

- Check if the load factor is good, otherwise resize the backing structure.
- Search a slot using one of the probing / search methods.

```rust
impl<K, V, S> MyHashmap<K, V, S>
where
    K: Eq + Hash,
    S: BuildHasher,
{
    pub fn insert(&mut self, key: K, value: V) -> Option<V> {
        if self.should_resize() {
            self.resize();
        }

        let slot = if self.quadratic {
            self.find_slot_quadratic_mut(&key)
        } else {
            self.find_slot_linear_mut(&key)
        };
        let new_slot = Some((key, value));
        let old_slot = std::mem::replace(slot, new_slot).map(|kv| kv.1);

        if old_slot.is_none() {
            self.len += 1;
        }

        old_slot
    }
}
```

### Resizing

Resizing involves allocating the new storage, and rehashing all entries into the new storage.

```rust
impl<K, V, S> MyHashmap<K, V, S>
where
    K: Eq + Hash,
    S: BuildHasher,
{
    fn resize(&mut self) {
        let new_storage: Vec<Option<(K, V)>> =
            (0..self.storage.len() * 2).map(|_| None).collect();

        // Replace the storage with the new one, so we can use self.x methods to rehash.
        let old_storage = std::mem::replace(&mut self.storage, new_storage);

        self.len = 0;

        for (k, v) in old_storage.into_iter().flatten() {
            self.insert(k, v);
        }
    }
}
```

### Searching
To search a key, we need to do the following:

- Search a slot using one of the probing / search methods.

```rust
impl<K, V, S> MyHashmap<K, V, S>
where
    K: Eq + Hash,
    S: BuildHasher,
{
    pub fn get(&self, key: &K) -> Option<&V> {
        let slot = if self.quadratic {
            self.find_slot_quadratic(key)
        } else {
            self.find_slot_linear(key)
        };
        slot.as_ref().map(|kv| &kv.1)
    }

    pub fn get_mut(&mut self, key: &K) -> Option<&mut V> {
        let slot = if self.quadratic {
            self.find_slot_quadratic_mut(key)
        } else {
            self.find_slot_linear_mut(key)
        };
        slot.as_mut().map(|kv| &mut kv.1)
    }
}
```

# Conclusion

And that's a way to implement a hash map using open addressing with linear or quadratic probing.

I benchmarked both and they were pretty close.

```
linear probing 10           time:   [255.08 ns 256.75 ns 258.66 ns]
quadratic probing 10        time:   [252.66 ns 252.96 ns 253.25 ns]

linear probing 100          time:   [3.7110 µs 3.7169 µs 3.7236 µs]
quadratic probing 100       time:   [3.6763 µs 3.6783 µs 3.6803 µs]

linear probing 1000         time:   [32.555 µs 32.703 µs 32.906 µs]
quadratic probing 1000      time:   [32.002 µs 32.046 µs 32.126 µs]

linear probing 10000        time:   [464.28 µs 464.39 µs 464.53 µs]
quadratic probing 10000     time:   [453.38 µs 454.40 µs 455.71 µs]

linear probing 100000       time:   [6.4169 ms 6.4213 ms 6.4267 ms]
quadratic probing 100000    time:   [6.3506 ms 6.3548 ms 6.3601 ms]
```

You can find all the code here: <https://gist.github.com/edg-l/7842a445367bfdf2a89ad8c5f70348d4>
