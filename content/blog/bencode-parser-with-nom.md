+++
title = "Creating a bencode parser with nom"
description = "The encoding used by the peer-to-peer file sharing system BitTorrent"
date = 2022-07-15
draft = true
[taxonomies]
categories = ["rust"]
+++

Since long I have wanted try out nom, at first I boldly started parsing [PDFs](https://github.com/edg-l/nompdf) but after realizing the scope of such project, I put it off and started with a way smaller idea: a bencode parser.

If you have never delved into the BitTorrent protocol you probably don't know what bencoding is so let me explain it.

# Bencode Spec

[Bencode](https://en.wikipedia.org/wiki/Bencode) is the encoding used by the BitTorrent protocol to store data, `.torrent` files are encoded using this.

It's a pretty [simple](http://www.bittorrent.org/beps/bep_0003.html#bencoding) encoding:

- Strings are length-prefixed base ten followed by a colon and the string. For example `4:spam` corresponds to `spam`.
- Integers are represented by an `i` followed by the number in base 10 followed by an `e`. For example `i3e` corresponds to `3` and `i-3e` corresponds to `-3`.
  Integers have no size limitation. `i-0e` is invalid. All encodings with a leading zero, such as `i03e`, are invalid, other than `i0e`, which of course corresponds to `0`.
- Lists are encoded as an `l` followed by their elements (also bencoded) followed by an `e`.
  For example `l4:spam4:eggse` corresponds to `['spam', 'eggs']`.
- Dictionaries are encoded as a 'd' followed by a list of alternating keys and their corresponding values followed by an 'e'. For example, `d3:cow3:moo4:spam4:eggse` corresponds to `{'cow': 'moo', 'spam': 'eggs'}` and `d4:spaml1:a1:bee` corresponds to `{'spam': ['a', 'b']}`.
  Keys must be strings and appear in sorted order (sorted as raw strings, not alphanumerics).

Now, I only saw it mentioned on [Wikipedia](https://en.wikipedia.org/wiki/Bencode) but the Strings are more like byte strings, since they don't require any proper encoding, and they are used as such.

# So what is nom?

It's a parser combinators library, which essentially means that from some really basic functions you create more complex ones and keep building on top of it, until you have one final function that parses everything.

There are quite a lot of already provided combinators, which you can find in the ["choosing a combinator"](https://github.com/Geal/nom/blob/main/doc/choosing_a_combinator.md) docs.

For example, there the parser function `digit1` which returns one or more digits.

```rust
fn parser(input: &str) -> IResult<&str, &str> {
    digit1(input)
}

assert_eq!(parser("21c"), Ok(("c", "21")));
assert_eq!(parser("c1"), Err(Err::Error(Error::new("c1", ErrorKind::Digit))));
assert_eq!(parser(""), Err(Err::Error(Error::new("", ErrorKind::Digit))));
```

All parsers and combinators are build around `IResult`:

```rust
pub type IResult<I, O, E = Error<I>> = Result<(I, O), Err<E>>;
```

Basically, when a parser correctly finishes, it returns a tuple with a slice starting where the parser ended and the parsed content.

So `digit1("123therest")` returns a tuple with `("therest", "123")`.

# Handling errors

Since when parsing bencode there can be possible errors outside what the combinators may find, such as leading 0's on integers, we need to create our own error struct:

```rust
#[derive(Debug, thiserror::Error)]
pub enum Error<I> {
    // For when the integer is invalid: e.g leading 0's
    #[error("invalid integer: {0:?}")]
    InvalidInteger(I),
    // For when the byte string length is invalid, e.g it's negative.
    #[error("invalid bytes length: {0:?}")]
    InvalidBytesLength(I),
    // For when there is an error parsing the ascii integer to a i64.
    #[error("parse int error: {0:?}")]
    ParseIntError(#[from] ParseIntError),
    // Errors from the combinators itself.
    #[error("nom parsing error: {0:?}")]
    NomError(#[from] nom::error::Error<I>),
}

impl<I> From<Error<I>> for nom::Err<Error<I>> {
    fn from(e: Error<I>) -> Self {
        nom::Err::Error(e)
    }
}

impl<I> From<nom::Err<Error<I>>> for Error<I> {
    fn from(e: nom::Err<Error<I>>) -> Self {
        e.into()
    }
}

impl<I> ParseError<I> for Error<I> {
    fn from_error_kind(input: I, kind: nom::error::ErrorKind) -> Self {
        Self::NomError(nom::error::Error { input, code: kind })
    }

    fn append(_: I, _: nom::error::ErrorKind, other: Self) -> Self {
        other
    }
}
```

We will also define the type alias BenResult, so we don't need to type as much everytime:

```rust
type BenResult<'a> = IResult<&'a [u8], Value<'a>, Error<&'a [u8]>>;
```

We use `&'a [u8]` since thats the type of data our parsers will be dealing with.

# Parsing the byte string

Lets start with the easiest one, the byte strings, as you can recall, made up of an ASCII integer, a colon and the data:

`4:spam`

Since the data can be non UTF-8 encoded, we will build the parser around `&[u8]` instead of `&str`.

```rust
fn parse_bytes(start_inp: &'a [u8]) -> BenResult<'a> {
    todo!()
}
```
