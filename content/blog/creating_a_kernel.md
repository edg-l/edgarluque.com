+++
title = "Creating an x86_64 kernel in Rust: Part 1"
description = "My journey creating a x86_64 Rust kernel"
date = 2025-08-28
[taxonomies]
categories = ["rust", "kernel", "x86_64"]
+++

This is some kind of blog series about my journey as I learn and implement my own Rust kernel.

Any knowledge shared here may not be fully true, since I do this as a hobby and I'm not an experienced kernel developer.
I'm just doing this for fun, learning about the true low level bits that make running a computer with the x86_64 architecture possible.

Sometimes I will mention some names or mnemonics, and maybe I won't explain them here, but I always try to put relevant links to more information.
After all, if you want to make a kernel, you will need to do research, **a lot**.

I also won't be doing everything from scratch, for example I will use the `x86_64` crate for some interactions with registers, and the `acpi` crate to parse and use the ACPI tables.


## The bootloader

I'll be using [limine](https://limine-bootloader.org/), for some reasons:

- I like it. Feels simple and modern.
- It provides a really nice [crate](https://crates.io/crates/limine) with a [template](https://github.com/jasondyoungberg/limine-rust-template) to create a kernel.
- We have bootloader support with UEFI out of the box, which is what most modern systems use (instead of the older BIOS).

To start, go to the [template](https://github.com/jasondyoungberg/limine-rust-template) and clone it or use the template button.

This template uses limine, and has a nice makefile to build and run the kernel under QEMU,
the makefile also downloads the UEFI firmware ([OVMF](https://github.com/tianocore/tianocore.github.io/wiki/OVMF)) needed by QEMU to use UEFI.

I also recommend creating a `.cargo` file inside the kernel folder with the following `config.toml`:

```toml
[build]
target = "x86_64-unknown-none"
```

The `x86_64-unknown-none` is a baremetal target that fits perfectly to create a kernel.

If you are using vscode I also recommend to create a `settings.json` with the following:

```json
{
    "rust-analyzer.cargo.target": "x86_64-unknown-none",
    "rust-analyzer.cargo.allTargets": false
}
```

You should look a bit around at the makefile to understand it.

I will only focus on x86_64 with UEFI, so I modified a bit the relevant runners (the one that uses cdrom and the one with hdd):

```make
.PHONY: run-x86_64
run-x86_64: ovmf/ovmf-code-$(KARCH).fd ovmf/ovmf-vars-$(KARCH).fd $(IMAGE_NAME).iso
	qemu-system-$(KARCH) \
		-M q35 \
		-drive if=pflash,unit=0,format=raw,file=ovmf/ovmf-code-$(KARCH).fd,readonly=on \
		-drive if=pflash,unit=1,format=raw,file=ovmf/ovmf-vars-$(KARCH).fd \
		-cdrom $(IMAGE_NAME).iso \
		-device isa-debug-exit,iobase=0xf4,iosize=0x04 \
		-serial stdio \
		-no-reboot \
		$(QEMUFLAGS)

.PHONY: run-hdd-x86_64
run-hdd-x86_64: ovmf/ovmf-code-$(KARCH).fd ovmf/ovmf-vars-$(KARCH).fd $(IMAGE_NAME).hdd
	qemu-system-$(KARCH) \
		-M q35 \
		-drive if=pflash,unit=0,format=raw,file=ovmf/ovmf-code-$(KARCH).fd,readonly=on \
		-drive if=pflash,unit=1,format=raw,file=ovmf/ovmf-vars-$(KARCH).fd \
		-hda $(IMAGE_NAME).hdd \
		-device isa-debug-exit,iobase=0xf4,iosize=0x04 \
		-serial stdio \
		-no-reboot \
		$(QEMUFLAGS)
```

The main changes are adding a serial for debug output, and disabling automatic reboot.

Disabling reboot is handy in case the kernel [triple faults](https://en.wikipedia.org/wiki/Triple_fault).

## Limine

With limine, you make "requests" to the bootloader to provide you with some information, for example to get the framebuffer, you request for it with:

```rust
#[used]
#[unsafe(link_section = ".requests")]
pub static FRAMEBUFFER_REQUEST: FramebufferRequest = FramebufferRequest::new();
```

This works alongside the support of a custom linker script, which comes with the template.

The linker script is needed because we need to tell the linker exactly where to put our requests in memory so that limine can find them. Without it, the linker might put our data anywhere, and limine wouldn't know where to look:

```
.data : {
    *(.data .data.*)

    /* Place the sections that contain the Limine requests as part of the .data */
    /* output section. */
    KEEP(*(.requests_start_marker))
    KEEP(*(.requests))
    KEEP(*(.requests_end_marker))
} :data
```

You should read the linker script and understand it.

See [wiki.osdev.org/Linker_Scripts](https://wiki.osdev.org/Linker_Scripts) and [docs/ld](https://sourceware.org/binutils/docs/ld/Scripts.html#Scripts)

On the script, you will also see a relevant entry:

```
/* We want to be placed in the topmost 2GiB of the address space, for optimisations */
/* and because that is what the Limine spec mandates. */
/* Any address in this region will do, but often 0xffffffff80000000 is chosen as */
/* that is the beginning of the region. */
. = 0xffffffff80000000;
```

This puts our kernel in the higher half virtual address range, which can only be accessed in ring 0 (the highest privilege level where the kernel runs), it also puts the kernel at the very top 2gb range.

The higher half approach is pretty common for kernels because it gives us some nice benefits: it protects the kernel from user programs (they can't access these addresses), and it makes memory management easier since we can map the kernel at the same virtual address in every process.

## Small intro to paging

Paging's main use is to provide each process with its own "virtual address space".

Virtual memory is divided into fixed-size blocks called pages, while physical memory is divided into equally sized page frames. Each page can be individually mapped to any frame, avoiding memory fragmentation.
This will be the job of our frame allocator alongside the memory mapper.

On x86_64, paging is achieved through the Memory Management Unit (MMU) using a series of tables:
- 4-level page tables: PML4 -> PDPT -> PD -> PT
- 48-bit virtual addresses (using canonical addressing)
- 4 KiB page size (typically)

The 48-bit virtual addresses need to be canonical, that is, they have to be sign extended. Also there is a gap in virtual addresses that aren't valid due to this.

Each page table has 512 entries of 8 bytes each, requiring 9 bits to address each entry.

When the CPU needs to translate a virtual address, it basically does this: takes the virtual address, splits it into chunks (9 bits for each level), and uses each chunk as an index to walk through the page tables until it finds the physical address. It's like following a path through multiple directories to find a file.

To improve performance, x86_64 caches recent translations in the Translation Lookaside Buffer (TLB), allowing translations to skip the multi-level table walk when cached.
The TLB must be manually invalidated by the kernel when page tables change using the `invlpg` instruction

Check out specially the osdev wiki on paging to understand more.

See more:
- [os.phil-opp.com](https://os.phil-opp.com/paging-implementation/)
- [wiki.osdev.org/Paging](https://wiki.osdev.org/Paging)
- [Introduction to Virtual Memory and the x86-64 MMU](https://cs61.seas.harvard.edu/wiki/2016/Kernel2X/)
- [CS 161 - Memory layout](https://read.seas.harvard.edu/cs161/2018/doc/memory-layout/)


## Reorganizing

I moved most of the main.rs code to a `boot.rs` file, where I'll have most limine related stuff, the real entry point, which will call the main at `main.rs`.

I did this because it's good to separate the boot logic from the actual kernel logic. The boot stuff is pretty specific to limine and getting everything set up, while main.rs should focus on the actual kernel functionality. Makes things cleaner and easier to understand.

Also created a BootInfo struct alongside a global static `BOOT_INFO` to access it easily.


```rust
// boot.rs

/// Sets the base revision to the latest revision supported by the crate.
/// See specification for further info.
/// Be sure to mark all limine requests with #[used], otherwise they may be removed by the compiler.
#[used]
// The .requests section allows limine to find the requests faster and more safely.
#[unsafe(link_section = ".requests")]
pub static BASE_REVISION: BaseRevision = BaseRevision::new();

#[used]
#[unsafe(link_section = ".requests")]
pub static FRAMEBUFFER_REQUEST: FramebufferRequest = FramebufferRequest::new();

/// Define the start and end markers for Limine requests.
#[used]
#[unsafe(link_section = ".requests_start_marker")]
static _START_MARKER: RequestsStartMarker = RequestsStartMarker::new();
#[used]
#[unsafe(link_section = ".requests_end_marker")]
static _END_MARKER: RequestsEndMarker = RequestsEndMarker::new();

#[expect(unused)]
pub struct BootInfo {
    pub framebuffer: Framebuffer<'static>,
}

pub static BOOT_INFO: Once<BootInfo> = Once::new();

pub fn boot_info() -> &'static BootInfo {
    unsafe { BOOT_INFO.get().unwrap_unchecked() }
}

#[unsafe(no_mangle)]
unsafe extern "C" fn kmain() -> ! {
    // All limine requests must also be referenced in a called function, otherwise they may be
    // removed by the linker.
    assert!(BASE_REVISION.is_supported());

    let framebuffer = FRAMEBUFFER_REQUEST
        .get_response()
        .expect("need a framebuffer")
        .framebuffers()
        .next()
        .expect("need a framebuffer");

    let boot_info = BootInfo {
        framebuffer,
    };

    BOOT_INFO.call_once(|| boot_info);

    main()
}


// main.rs

use x86_64::instructions::hlt;

mod boot;

fn main() -> ! {
    loop {
        hlt();
    }
}

#[panic_handler]
fn rust_panic(info: &core::panic::PanicInfo) -> ! {
    loop {
        hlt();
    }
}

```

`Once` comes from the spin crate (it's like a no_std OnceCell), and `hlt` from the `x86_64` crate.

The `hlt` instruction is better than just doing `loop {}` because it actually puts the CPU to sleep until an interrupt happens, which saves power and doesn't waste CPU cycles.

```toml
spin = "0.10.0"
x86_64 = "0.15.2"
```

## What's next?

- Setting up a frame allocator
- Creating a memory mapper
- Initializing the kernel heap
- Creating the GDT.
- Handling interrupts and exceptions
- Parsing the ACPI tables.
