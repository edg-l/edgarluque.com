+++
title = "Rust Generic Function Size Trick"
date = 2024-07-01
description = "A simple trick to avoid generics generating a lot of code."
[taxonomies]
categories = ["rust"]
+++

When using generics in Rust (an any language that supports this), what happens under the hood is that the compiler generates a function
implementation when it finds a call for each combination of different types used in the generic parameters.

This can produce a lot of code if the function body is big.


```rust
pub fn work_with_path<T: AsRef<Path>>(path: T) {
    // Here the body is small, but imagine this method has 100+ lines.
    println!("{}", path.as_ref().display());
}
```
For every call to `work_with_path` with a different type `T` a implementation is generated.

Instead, we can do this

```rust
pub fn work_with_path<T: AsRef<Path>>(path: T) {
    #[inline(never)] // inline is needed in this case because the inner method is small in the example.
    fn work_with_path(path: &Path) {
        println!("{}", path.display())
    }

    let path = path.as_ref();
    work_with_path(path);
}
```

And the big meaty function will only be generated once, while the code to turn the type T into a valid reference to a path will be whats generated multiple times, depending on the T. Which usually is a small part of the method.

[Godbolt URL](https://godbolt.org/z/aaerf1PPE) (using `inline(never)` on the outer functions to avoid inlining them in main)

The `std` does this in multiple places, like this [one](https://doc.rust-lang.org/src/std/path.rs.html#2405-2411) or this [one](https://doc.rust-lang.org/src/std/path.rs.html#2603-2630)

Example from the `std`:

```rust
#[stable(feature = "rust1", since = "1.0.0")]
pub fn with_extension<S: AsRef<OsStr>>(&self, extension: S) -> PathBuf {
    self._with_extension(extension.as_ref())
}

fn _with_extension(&self, extension: &OsStr) -> PathBuf {
    let self_len = self.as_os_str().len();
    let self_bytes = self.as_os_str().as_encoded_bytes();

    let (new_capacity, slice_to_copy) = match self.extension() {
        None => {
            // Enough capacity for the extension and the dot
            let capacity = self_len + extension.len() + 1;
            let whole_path = self_bytes.iter();
            (capacity, whole_path)
        }
        Some(previous_extension) => {
            let capacity = self_len + extension.len() - previous_extension.len();
            let path_till_dot = self_bytes[..self_len - previous_extension.len()].iter();
            (capacity, path_till_dot)
        }
    };

    let mut new_path = PathBuf::with_capacity(new_capacity);
    new_path.as_mut_vec().extend(slice_to_copy);
    new_path.set_extension(extension);
    new_path
}
```
