+++
title = "Rust Iterators: Fibonacci series"
description = "Implementing an iterator that generates fibonacci numbers."
date = 2020-12-01
[taxonomies]
categories = ["rust"]
+++

In this article we will implement an iterator that generates Fibonacci numbers, 
where each number is the sum of the preceding ones, starting with 0 and 1.

First we define our data structure:

```rust
struct Fibonacci {
    a: u64,
    b: u64,
}

impl Fibonacci {
    fn new() -> Self {
        Fibonacci {
            a: 1,
            b: 0
        }
    }
}
```

Here a and b represent the preceding numbers.

To implement the iterator we need to implement the `std::iter::Iterator` trait.

```rust
trait Iterator {
    type Item;
    fn next(&mut self) -> Option<Self::Item>;
}
```

Thus, we have to import it:

```rust
use std::iter::Iterator;
```

We need to define the type Item and implement `next()`.

```rust
impl Iterator for Fibonacci {
    type Item = u64;

    fn next(&mut self) -> Option<Self::Item> {
        let r = self.b;
        self.b = self.a;
        self.a += r;
        Some(r)
    }
}
```

Since fibonacci series are infinite, we always return Some(), but if you implement a non-infinite iterator you will have to return None at some point.

And then to see how it works:

```rust
fn main() {
    let fib = Fibonacci::new();

	// Take 20 fibonacci numbers and put them into a vector.
    let result: Vec<u64> = fib.take(20).collect();

    println!("{:?}", result);
}
```

Which outputs:

```
[0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181]
```

