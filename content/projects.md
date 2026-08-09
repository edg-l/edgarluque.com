+++
title = "Projects"
template_page = "page.html"
+++

All my projects are hosted at [github.com/edg-l](https://github.com/edg-l) and [git.edgarluque.com](https://git.edgarluque.com/)

## EDOS

A hobby operating system for x86_64, written from scratch in Rust. It boots on
UEFI, brings up every core with an SMP preemptive scheduler, and has its own
journaling filesystem, TCP/IP stack, xHCI USB and AHCI/NCQ storage drivers, and
a compositing window manager. Userspace programs are built against a real Rust
`std`, ported to it.

[edos.edgl.dev](https://edos.edgl.dev/) &middot; [github.com/edg-l/edos](https://github.com/edg-l/edos)

## Blitz

A compiler backend that targets x86-64 and nothing else, on purpose. It turns
SSA-style IR into linkable ELF objects, and does optimization and instruction
selection in a single e-graph: algebraic rewrites, strength reduction, constant
folding and x86 instruction selection all compete in the same equality
saturation pass, with a cost model picking the winner. No separate isel phase to
undo the optimizer's work.

[github.com/edg-l/blitz](https://github.com/edg-l/blitz)

## sitewriter
A rust library to write sitemaps

[github.com/edg-l/sitewriter](https://github.com/edg-l/sitewriter)

## paypal-rs
A rust library that wraps the paypal api asynchronously.

[github.com/edg-l/paypal-rs](https://github.com/edg-l/paypal-rs)
