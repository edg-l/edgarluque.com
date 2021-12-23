+++
title = "Wrapping errors in Rust"
description = "Wrap internal and external errors with your own error type."
date = 2021-01-24
+++

While I was developing a rust crate ([paypal-rs](https://github.com/edg-l/paypal-rs)) I noticed my error handling was pretty bad.

In that crate I had to handle 2 different types of errors:
- HTTP related errors, in this case `reqwest::Error`
- Paypal API errors, which I represent with my own struct `PaypalError`.

Initially I used [anyhow](https://github.com/dtolnay/anyhow) but then I found out this is pretty much only good to be used on binary applications, not in libraries.

The way to make this nice and clean for the library consumers is to wrap the errors.

## Wrapping the errors
First we need to know which errors need to be wrapped, in my case I have `PaypalError`:

```rust
/// A paypal api response error.
#[derive(Debug, Serialize, Deserialize)]
pub struct PaypalError {
    // ...
}

// implement Error and Display for PaypalError...
```

And then an error from the reqwest library: `reqwest::Error`.

First we create an enum to represent all possible errors in our library:

```rust
#[derive(Debug)]
pub enum ResponseError {
    /// paypal api error.
    ApiError(PaypalError),
    /// http error.
    HttpError(reqwest::Error)
}
```

And as with any error, we have to implement `Error` and `fmt::Display`:

```rust
impl fmt::Display for ResponseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ResponseError::ApiError(e) => write!(f, "{}", e),
            ResponseError::HttpError(e) => write!(f, "{}", e),
        }
    }
}

impl Error for ResponseError {
    // Implement this to return the lower level source of this Error.
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            ResponseError::ApiError(e) => Some(e),
            ResponseError::HttpError(e) => Some(e),
        }
    }
}
```

Now we should make all the functions that return a Result use the new Error type, this will also give consistency to all our functions.

However, right now we can't use `?` directly on our wrapped Errors:

```rust
/// func_call_returns_error() returns a Result<(), reqwest::Error>

pub fn some_func() -> Result<(), ResponseError> {
    // Won't work, because the error returned is not ResponseError and has no From implementation!
    // func_call_returns_error()?
    // However we can map it.
    func_call_returns_error().map_err(ResponseError::HttpError)?;
    Ok(())
}
```

## Implementing From on the wrapped errors

To solve this, we have to implement `From<PaypalError>` and `From<reqwest::Error>`:

```rust
impl From<PaypalError> for ResponseError {
    fn from(e: PaypalError) -> Self {
        ResponseError::ApiError(e)
    }
}

impl From<reqwest::Error> for ResponseError {
    fn from(e: reqwest::Error) -> Self {
        ResponseError::HttpError(e)
    }
}
```

And now our code becomes like this:

```rust
pub fn some_func() -> Result<(), ResponseError> {
    func_call_returns_error()?;
    Ok(())
}
```

## The library to skip all this process
There is a library called [thiserror](https://github.com/dtolnay/thiserror), which implements macros to make this process a breeze, here is how our code ends up if we use this library:

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ResponseError {
    /// A paypal api error.
    #[error("api error {0}")]
    ApiError(#[from] PaypalError),
    /// A http error.
    #[error("http error {0}")]
    HttpError(#[from] reqwest::Error)
}
```

And that's all the code we need!

This is equal (or maybe even better) than our previous code, the best is that it is entirely transparent, the library consumers won't even know `thiserror` was used, quoting their github:

> Thiserror deliberately does not appear in your public API. You get the same thing as if you had written an implementation of std::error::Error by hand, and switching from handwritten impls to thiserror or vice versa is not a breaking change.