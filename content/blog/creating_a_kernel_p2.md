+++
title = "Creating an x86_64 kernel in Rust: Part 2"
description = "Adding serial output."
date = 2025-08-28
draft = true
[taxonomies]
categories = ["rust", "kernel", "x86_64"]
+++

## Adding Serial output

QEMU provides serial output by specifying it in the cli options:

```bash
-device isa-debug-exit,iobase=0xf4,iosize=0x04 \
-serial stdio \
```

The device isa-debug-exit allows us to exit QEMU easily.

The serial output is an [16550 UART](https://en.wikipedia.org/wiki/16550_UART) universal asynchronous receiver-transmitter.

For this, we will use the [uart_16550](https://docs.rs/uart_16550/latest/uart_16550/) crate, which interfaces with the port-mapped I/O.

Let's create a file named `serial.rs`, where we will add a serial_println macro, so we can have nice debug output.

```rust
use core::fmt::{self, Write};

use spin::{Once, mutex::Mutex};
use uart_16550::SerialPort;

static SERIAL_DBG: Once<Mutex<SerialPort>> = Once::new();

pub fn init() {
    SERIAL_DBG.call_once(|| {
        let mut port = unsafe { uart_16550::SerialPort::new(0x3F8) };
        port.init();
        Mutex::new(port)
    });
}

#[macro_export]
macro_rules! serial_print {
    ($($arg:tt)*) => ($crate::serial::_serial_print(format_args!($($arg)*)));
}

#[macro_export]
macro_rules! serial_println {
    () => ($crate::serial_print!("\n"));
    ($($arg:tt)*) => ($crate::serial_print!("{}\n", format_args!($($arg)*)));
}

#[doc(hidden)]
pub fn _serial_print(args: fmt::Arguments) {
    unsafe {
        SERIAL_DBG
            .get()
            .unwrap_unchecked()
            .lock()
            .write_fmt(args)
            .unwrap();
    }
}
```

`format_args!` doesn't heap allocate, so this works even before we have a heap allocator.

The port `0x3F8` is the COM1 port. You can find out more in the [osdev](https://wiki.osdev.org/Serial_Ports) wiki

Since we want to have serial output as early as possible, I added the init call to the `boot.rs file`:


```rust
// boot.rs


#[unsafe(no_mangle)]
unsafe extern "C" fn kmain() -> ! {
    // All limine requests must also be referenced in a called function, otherwise they may be
    // removed by the linker.
    assert!(BASE_REVISION.is_supported());

    // Early init serial in case we panic on expects.
    serial::init();

    /// ...
}
```

Since we can print now, let's modify the panic handler to print the panic info:

```rust
// main.rs

#[panic_handler]
fn rust_panic(info: &core::panic::PanicInfo) -> ! {
    serial_println!("KERNEL PANIC:");
    serial_println!("{info:#?}");
    loop {
        hlt();
    }
}
```
