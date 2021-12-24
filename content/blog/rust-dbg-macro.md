+++
title = "The Rust dbg! macro"
description = "A short article about a quite unknown but useful macro in Rust."
date = 2021-07-25
[taxonomies]
categories = ["rust"]
+++

The `dbg!` macro is a useful macro to debug, and I think a not well known one, not to be confused with debug logs using format strings, this macro is useful when you are about to put `println` calls everywhere in your code to know if it reached a path, what value a variable has, etc.

It uses the `Debug` trait implementation of the type of the given expression.

Since Rust is an expression oriented language, you can use this macro nearly everywhere:

```rust
fn factorial(n: u32) -> u32 {
    if dbg!(n <= 1) {
        dbg!(1)
    } else {
        dbg!(n * factorial(n - 1))
    }
}

fn main() {
    dbg!(factorial(4));
}
```

This outputs the following:

```
[src/main.rs:2] n <= 1 = false
[src/main.rs:2] n <= 1 = false
[src/main.rs:2] n <= 1 = false
[src/main.rs:2] n <= 1 = true
[src/main.rs:3] 1 = 1
[src/main.rs:5] n * factorial(n - 1) = 2
[src/main.rs:5] n * factorial(n - 1) = 6
[src/main.rs:5] n * factorial(n - 1) = 24
[src/main.rs:10] factorial(4) = 24
```

Using this macro without any argument will print the current file and line number.

One thing to be aware is that this macro moves the input, in cases where this is a problem it's useful to borrow.

Sources:
- <https://doc.rust-lang.org/std/macro.dbg.html>