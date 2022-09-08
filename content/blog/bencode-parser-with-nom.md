+++
title = "Creating a bencode parser with nom"
description = "The encoding used by the peer-to-peer file sharing system BitTorrent"
date = 2022-09-08
[taxonomies]
categories = ["rust"]
+++

Since long I wanted try out nom, at first I boldly started parsing [PDFs](https://github.com/edg-l/nompdf) but after realizing the scope of such project, I put it off and started with a way smaller idea: a bencode parser.

If you have never delved into the BitTorrent protocol you probably don't know what bencoding is so let me explain it.

# The Bencode Spec

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

It comes with some basic combinators, you can find them in the ["choosing a combinator"](https://github.com/Geal/nom/blob/main/doc/choosing_a_combinator.md) docs.

For example, there is a parser function `digit1` which returns one or more digits.

```rust
fn parser(input: &str) -> IResult<&str, &str> {
    digit1(input)
}

assert_eq!(parser("21c"), Ok(("c", "21")));
assert_eq!(parser("c1"), Err(Err::Error(Error::new("c1", ErrorKind::Digit))));
assert_eq!(parser(""), Err(Err::Error(Error::new("", ErrorKind::Digit))));
```

All parsers are build around `IResult`:

```rust
pub type IResult<I, O, E = Error<I>> = Result<(I, O), Err<E>>;
```

Basically, when a parser correctly finishes, it returns a tuple with a slice starting where the parser ended and the parsed content. It seamlessly works with `&str` and `&[u8]` so most of the time you don't need to do any allocation when parsing.

So `digit1("123therest")` returns a tuple with `("therest", "123")`.

# Handling errors

When parsing bencode there can be possible errors outside of what the combinators may find, such as leading 0's on integers, we need to create our own error struct:

```rust
#[derive(Debug, thiserror::Error)]
pub enum Error<I> {
    // When the integer is invalid: e.g leading 0's
    #[error("invalid integer: {0:?}")]
    InvalidInteger(I),
    // When the byte string length is invalid, e.g it's negative.
    #[error("invalid bytes length: {0:?}")]
    InvalidBytesLength(I),
    // When there is an error parsing the ascii integer to a i64.
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

We use `&[u8]` since thats the type of data our parsers will be dealing with.

# Representing all the possible bencode value types

To hold all the value types bencode has, an enum like this will do:

```rust
#[derive(Debug, Clone)]
pub enum Value<'a> {
    Bytes(&'a [u8]),
    Integer(i64),
    List(Vec<Self>),
    Dictionary(HashMap<&'a [u8], Self>),
}
```

# Parsing the byte string

Lets start with the easiest one, byte strings, as you can recall, they are made up of the a textual integer, a colon and the data:

`4:spam`

Since the data can be non UTF-8 encoded, we will build the parser around `&[u8]` instead of `&str`.

```rust
fn parse_bytes(start_inp: &'a [u8]) -> BenResult<'a> {
    todo!()
}
```

We can use the [digit1](https://docs.rs/nom/7.1.1/nom/character/complete/fn.digit1.html) combinator to get the length of the byte string and then the [char](https://docs.rs/nom/7.1.1/nom/character/complete/fn.char.html) to consume the colon:

```rust
let (inp, length) = digit1(start_inp)?;

// We don't need the colon so we just discard it with '_'.
let (inp, _) = char(':')(inp)?;
```

Now we need to convert the length (which is a number in ASCII) to an integer and check if it's 0, which would be an error:

```rust
// SAFETY: digit1 always returns ASCII numbers, which are always valid UTF-8.
let length = unsafe { std::str::from_utf8_unchecked(length) };

let length: u64 = length.parse().map_err(Error::ParseIntError)?;

if length == 0 {
    Err(Error::InvalidBytesLength(start_inp))?
}
```

Then we use the [take](https://docs.rs/nom/7.1.1/nom/bytes/complete/fn.take.html) parser to take an exact amount of elements and finally return it, resulting in the complete function like this:

```rust
fn parse_bytes(start_inp: &'a [u8]) -> BenResult<'a> {
    let (inp, length) = digit1(start_inp)?;

    let (inp, _) = char(':')(inp)?;

    // SAFETY: digit1 always returns ASCII numbers, which are always valid UTF-8.
    let length = unsafe { std::str::from_utf8_unchecked(length) };

    let length: u64 = length.parse().map_err(Error::ParseIntError)?;

    if length == 0 {
        Err(Error::InvalidBytesLength(start_inp))?
    }

    let (inp, characters) = take(length)(inp)?;

    Ok((inp, Value::Bytes(characters)))
}
```

# Parsing integers

Format: `i10e`, `i-30e`

Integers can come alone or with the positive and negative symbol, we also need to handle the invalid `-0` and they can't have leading `0`s like `002`.

Here the power of combinators can come to light, we will use the following parsers and combine them:

- [delimited](https://docs.rs/nom/7.1.1/nom/sequence/fn.delimited.html):  Matches an object from the first parser and discards it, then gets an object from the second parser, and finally matches an object from the third parser and discards it.
- [char](https://docs.rs/nom/7.1.1/nom/character/complete/fn.char.html): Recognizes and consumes a single character.
- [alt](https://docs.rs/nom/7.1.1/nom/branch/fn.alt.html): Tests a list of parsers one by one until one succeeds.
- [recognize](https://docs.rs/nom/7.1.1/nom/combinator/fn.recognize.html): If the child parser was successful, return the consumed input as produced value.
- [pair](https://docs.rs/nom/7.1.1/nom/sequence/fn.pair.html): Gets an object from the first parser, then gets another object from the second parser.

With this we can handle the following example numbers: `1,+1,-1,10,0,50,-62`

```rust
fn parse_integer(start_inp: &'a [u8]) -> BenResult<'a> {
    let (inp, value) = delimited(
        char('i'),
        alt((
            recognize(pair(char('+'), digit1)),
            recognize(pair(char('-'), digit1)),
            digit1,
        )),
        char('e'),
    )(start_inp)?;

    // SAFETY: This will always be a valid UTF-8 sequence.
    let value_str = unsafe { std::str::from_utf8_unchecked(value) };

    if value_str.starts_with("-0") || (value_str.starts_with('0') && value_str.len() > 1) {
        Err(Error::InvalidInteger(start_inp))?
    } else {
        let value_integer: i64 = value_str.parse().map_err(Error::ParseIntError)?;
        Ok((inp, Value::Integer(value_integer)))
    }
}
```

# Parsing lists

Format: `li2ei3ei4ee`, `l4:spam4:eggsi22eli1ei2eee`

A list can hold any type of value, including dictionaries and list themselves.

Now that we can parse numbers and byte strings, parsing lists is just a matter of using those parsers.

We will use the following new nom parsers:

- [many_till(f, g)](https://docs.rs/nom/7.1.1/nom/multi/fn.many_till.html): Applies the parser f until the parser g produces a result. Returns a pair consisting of the results of f in a Vec and the result of g.

We will apply the parser `alt` until the `char` parser recognizes the end character `e`:

```rust
// Self here is the enum Value

fn parse_list(start_inp: &'a [u8]) -> BenResult<'a> {
    let (inp, value) = preceded(
        char('l'),
        many_till(
            alt((
                Self::parse_bytes,
                Self::parse_integer,
                Self::parse_list,
                Self::parse_dict,
            )),
            char('e'),
        ),
    )(start_inp)?;

    Ok((inp, Value::List(value.0)))
}
```

# Parsing dictionaries

Format: `d3:cow3:moo4:spam4:eggse`

Parsing dictionaries is nearly identical to parsing lists, but we need to parse the keys too, which are byte strings:

```rust
fn parse_dict(start_inp: &'a [u8]) -> BenResult<'a> {
    let (inp, value) = preceded(
        char('d'),
        many_till(
            pair(
                Self::parse_bytes,
                alt((
                    Self::parse_bytes,
                    Self::parse_integer,
                    Self::parse_list,
                    Self::parse_dict,
                )),
            ),
            char('e'),
        ),
     )(start_inp)?;

    let data = value.0.into_iter().map(|x| {
        // Keys are always a byte string
        if let Value::Bytes(key) = x.0 {
            (key, x.1)
        } else {
            unreachable!()
        }
    });

    let map = HashMap::from_iter(data);

    Ok((inp, Value::Dictionary(map)))
}
```

# The parser

And finally, we can make the final parser function which parses all the possible values:

```rust
pub fn parse(source: &[u8]) -> Result<Vec<Value>, Error<&[u8]>> {
    let (_, items) = many_till(
        alt((
            Value::parse_bytes,
            Value::parse_integer,
            Value::parse_list,
            Value::parse_dict,
        )),
        eof,
    )(source)?;

    Ok(items.0)
}
```

You can find the full source code here: <https://github.com/edg-l/nom-bencode>
