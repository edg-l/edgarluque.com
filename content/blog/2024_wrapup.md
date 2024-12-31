+++
title = "A 2024 wrap up"
description = "Things I did and learned on 2024"
date = 2024-12-31
[taxonomies]
categories = ["personal"]
+++

In 2024, I started some side projects:

My own programming language, [edlang](https://ed-lang.org/), which I made mostly to learn more about compilers, it uses the inkwell rust library, which is a nice wrapper for the LLVM codegen library.

A RISCV (RV64G) emulator, which I called [rysk](https://github.com/edg-l/rysk), this helped me learn about the RISCV architecture. It's pretty bare-bones but cool nonetheless.

At work, we use a lot MLIR, thanks to this I helped grow the MLIR ecosystem in Rust, after some contributions and gaining some trust, a GitHub organization named [mlir-rs](https://github.com/mlir-rs) was created, with me as one of the admins. This org has projects related to MLIR, such as `melior`, `mlir-sys`, `tblgen-rs`, which are essential as of today to develop with MLIR in Rust. You can learn more about this on my other [blog post](https://edgl.dev/blog/mlir-with-rust/) about MLIR.

I also made a [MLIR workshop](https://lambdaclass.github.io/mlir-workshop/), where one implements a really simple language using MLIR/melior in Rust.

Another project at work I've been working non-stop is [cairo-native](https://github.com/lambdaclass/cairo_native), which is nearly complete, and we are now ironing out the latest details (and keeping up with Cairo updates). This project is what have given me the most insight into compilers and MLIR. It will also be used on the Starknet sequencer.

There is also another programming language in the makings I'm helping at my day job: [concrete](https://github.com/lambdaclass/concrete) which I am a core contributor, it's still very early in development, but it has really nice ideas. Isn't it every programmer dream to make a programming language and be paid for it?

I also continued to maintain the ddnet [wiki](https://wiki.ddnet.org), which as of now has 9,737,563 views and 369 registered users.

I've looked a bit into [OCaml](https://ocaml.org/), was a bit disappointed in the tooling, but the language itself is really cool. I also tried a bit [Gleam](https://gleam.run/) and I like it a lot, looks like a merge of elixir and Rust.

Some stuff I'm also proud of, I made some real contributions to the llvm project itself, like improving the C MLIR API so we can add more features to melior. I also fixed some small stuff in the Rust bootstrapping script `x.py`.

In 2025, I'm looking forward to learning more programming languages, writing more blog posts (I only wrote 2 this year…), learning a bit about AI, making yet another game engine and more crazy ideas I'll probs abandon but are [just for fun](https://justforfunnoreally.dev/).
