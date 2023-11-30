+++
title = "x86_64 Assembly notes"
date = 2023-11-30
draft = true
description = "Notes I gathered for myself as I learn."
[taxonomies]
categories = ["asm", "nasm", "x86_64"]
+++

Here is a post I will probably update as I learn more x86_64 assembly.

# AMD64 ABI Reference

From left to right, pass as many parameters as will fit in registers. The order in which registers are allocated, are:

- For non-floats: rdi, rsi, rdx, rcx, r8, r9.
- For floating-point: xmm0, xmm1, xmm2, xmm3, xmm4, xmm5, xmm6, xmm7.
- Callee saved: rsp, rbx, rbp, r12-r15
- Return value: `rax`
- Stack pointer: `rsp`
- Base pointer: `rbp`

# Call Frame

Stack grows downwards.

```asm
caller:
    push rbp ; save old frame
    mov rbp, rsp ; init frame
    ; arguments passed in the stack are upwards
    mov r14, [rbp + 0x10]
    ; ...
    mov rsp, rbp
    pop rbp
    ret
```

## x86_64 Cheatsheet

|s|b|
|---|---|
|a|b|
|a|b|
|a|b|
|a|b|
