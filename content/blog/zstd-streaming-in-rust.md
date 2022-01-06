+++
title = "Parsing compressed files efficiently with Rust"
description = "Sometimes you need a bit of a stream."
date = 2022-01-06
[taxonomies]
categories = ["rust"]
+++

I recently wanted to create a tool to create plots showing concurrent players each day on [DDraceNetwork](https://ddnet.tw/) (DDNet for short).

DDNet hosts an HTTP "master server", which is what the game client uses to fetch information about game servers they can join.
Thankfully they keep online the master server status of [previous days](https://ddnet.tw/stats/master/).

Each `.tar.zstd` file contains a JSON file every 5 seconds starting from 00:00 to 23:59 which has information about all servers and players within those servers at that current time.

## The problem

These files, while compressed use only about ~8mb, but they are very efficiently compressed, when decompressed they take about 7gb.

So if we don't want to use a lot of disk space or RAM we need to parse the data in a streaming way.

## The libraries

We will use the following libraries to achieve this:

- [tar](https://lib.rs/crates/tar): To read the entries of the tar archive.
- [zstd](https://lib.rs/crates/zstd): To decompress the files.
- [ureq](https://lib.rs/crates/ureq): To get the archives.
  
## Fetching the data

```rust
let resp = ureq::get("https://ddnet.tw/stats/master/2022-01-04.tar.zstd").call()?;

// Read the content length from the header.
let len: usize = resp.header("Content-Length").unwrap().parse()?;

// Initialize the vector with the given length capacity.
let mut bytes_compressed: Vec<u8> = Vec::with_capacity(len);

// Read everything.
resp.into_reader()
    .take(15 * 1024 * 1024) // read max 15mb
    .read_to_end(&mut bytes_compressed)?;
```

## Processing the data

In Rust i/o operations are modeled around 2 traits: [Read](https://doc.rust-lang.org/std/io/trait.Read.html) and [Write](https://doc.rust-lang.org/std/io/trait.Write.html),
thanks to this it's really ergonomic to use both libraries (tar and zstd) together.

First, since `Vec` doesn't implement Read we need to wrap it around a [Cursor](https://doc.rust-lang.org/std/io/struct.Cursor.html) which implements [Read](https://doc.rust-lang.org/std/io/trait.Read.html).

```rust
let buffer = Cursor::new(bytes_compressed);
```

Good, now we can pass this buffer to the zstd [Decoder](https://docs.rs/zstd/0.9.0+zstd.1.5.0/zstd/stream/read/struct.Decoder.html), which takes anything that implements [Read](https://doc.rust-lang.org/std/io/trait.Read.html),
it also wraps it around a [BufRead](https://doc.rust-lang.org/nightly/std/io/trait.BufRead.html) for buffered reading.

```rust
// The type of decoder is Decoder<BufReader<Cursor<Vec<u8>>>>
let decoder = zstd::stream::Decoder::new(buffer)?;
```

Now we need to pass this `decoder` to tar to get its entries:

```rust
let mut archive = tar::Archive::new(decoder);

// Loop over the entries

for entry in archive.entries()? {
    let entry = e.unwrap();
    let path = entry.path().unwrap();
    let filename = path.file_name().expect("be a file");
    // process each entry
}
```

Here entry implements Read too, in our case each entry is a json file, we could parse it this way, for example using `serde` and `simd_json`:

```rust
let data: ServerList = simd_json::from_reader(entry).expect("parse json");
```

This way, we are parsing each file efficiently while using almost no RAM thanks to the streaming nature of these operations.

This all fits really well thanks to the design of [Read](https://doc.rust-lang.org/std/io/trait.Read.html) and [Write](https://doc.rust-lang.org/std/io/trait.Write.html).

## The tool

Here is the source code of the tool: <https://github.com/edg-l/teemasterparser>

And an image of the result:

<img src="https://github.com/edg-l/teemasterparser/raw/master/example.svg" width="100%">