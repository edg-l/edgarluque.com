+++
title = "Intro to LLVM and MLIR with Rust and Melior"
date = 2023-11-27
description = "Learning MLIR with too many dialects."
[taxonomies]
categories = ["rust", "MLIR", "LLVM"]
+++

If you haven't heard about [MLIR](https://mlir.llvm.org/) yet, it is a novel project born within LLVM, also what powers [MOJO](https://www.modular.com/mojo), the [Torch-MLIR project](https://github.com/llvm/torch-mlir), the high level IR of [flang](https://github.com/llvm/llvm-project/tree/main/flang), [iree](https://github.com/openxla/iree) and [more](https://mlir.llvm.org/users/).

But in case you don't know much about LLVM yet, I'll try to explain a bit.

# A primer on LLVM

LLVM, as their [web](https://llvm.org/) says,  is a collection of modular and reusable compiler and toolchain technologies. But in this post I will focus on the LLVM Core libraries, which focus on providing a source, target independent optimizer with code generation for many CPUs.

LLVM basis is the LLVM IR, a [Static single-assignment form](https://en.wikipedia.org/wiki/Static_single-assignment_form) (SSA) language, that looks like pseudo assembly. The main property of SSA is that each variable is assigned exactly once and defined before it is used.

It is what LLVM works on to apply all the optimization passes, it being SSA is one of the major enablers of the optimizations it can do (and what makes it easier to implement them), to name a few (from wikipedia):

- **Constant propagation**: conversion of computations from runtime to compile time, e.g. treat the instruction a=3*4+5; as if it were a=17;
- **Value range propagation**: precompute the potential ranges a calculation could be, allowing for the creation of branch predictions in advance.
- **Sparse conditional constant propagation**: range-check some values, allowing tests to predict the most likely branch.
- **Dead-code elimination**: remove code that will have no effect on the results.
- **Global value numbering**: replace duplicate calculations producing the same result.
- **Partial-redundancy elimination**: removing duplicate calculations previously performed in some branches of the program.
- **Strength reduction**: replacing expensive operations by less expensive but equivalent ones, e.g. replace integer multiply or divide by powers of 2 with the potentially less expensive shift left (for multiply) or shift right (for divide).
- **Register allocation**: optimize how the limited number of machine registers may be used for calculations.

If you want to learn LLVM IR in detail, you should look at the [LLVM Language Reference  Manual](https://llvm.org/docs/LangRef.html). If you know assembly already it shouldn't be too hard, one interesting property is that LLVM has infinite registers, so you don't need to worry about register allocation.
It has a simple type system, you can work with integers of any bit size (i1, i32, i1942652), although if you don't use a recent version (17+) you will find some bugs using big integers.

Probably the biggest wall you will hit is learning about GEPs (Get Element Ptr), it's often misunderstood how it works, so they even have a entire documentation page for it: <https://llvm.org/docs/GetElementPtr.html>.
Another thing that may need attention are [PHI nodes](https://stackoverflow.com/questions/11485531/what-exactly-phi-instruction-does-and-how-to-use-it-in-llvm), which are how LLVM selects a value that comes from control flow branches due to the nature of SSA.

The API to build such IR have the following structure:

- Context: Opaquely owns and manages the global data of the LLVM infrastructure, including types, uniquing tables, etc.
- Module: The top level container of all other IR objects, it is akin to a compile unit, holds a list of global variables, functions, libraries or other modules it depends on, a symbol table, and target data such as the layout.
- Builder: Provides a uniform API for creating instructions and inserting them into a basic block. Blocks contain a list of sequential instructions, and you can jump using blocks, they are like assembbly labels.

If you want to use LLVM with Rust in a type safe manner, I recommend the really well done [inkwell](https://github.com/TheDan64/inkwell) crate. Check out their README to see how the previous mentioned structures are used.

# MLIR

So what is MLIR? It goes a level above, in that LLVM IR itself is one of it's dialects.

MLIR is kind of a IR of IRs, and it supports many of them using "dialects". For example, you may have heard of NVVM IR (CUDA), MLIR supports modeling it through the [NVVM](https://mlir.llvm.org/docs/Dialects/NVVMDialect/) dialect (or [ROCDL](https://mlir.llvm.org/docs/Dialects/ROCDLDialect/) for AMD), but there is also a more generic and higher level [GPU](https://mlir.llvm.org/docs/Dialects/GPU/) dialect.

Those dialects define *conversion* [passes](https://mlir.llvm.org/docs/Passes/) between them, meaning for example, you can convert IR code using the GPU dialect to the NVVM dialect.

They also may define dialect passes, for example the `-gpu-map-parallel-loops` which greedily maps loops to GPU hardware dimensions.

Some notable dialects:

- [Builtin](https://mlir.llvm.org/docs/Dialects/Builtin/): The builtin dialect contains a core set of Attributes, Operations, and Types that have wide applicability across a very large number of domains and abstractions. Many of the components of this dialect are also instrumental in the implementation of the core IR.
- [Affine](https://mlir.llvm.org/docs/Dialects/Affine/): This dialect provides a powerful abstraction for affine operations and analyses.
- [Async](https://mlir.llvm.org/docs/Dialects/AsyncDialect/): Types and operations for async dialect This dialect contains operations for modeling asynchronous execution.
- [SCF](https://mlir.llvm.org/docs/Dialects/SCFDialect/): The scf (structured control flow) dialect contains operations that represent control flow constructs such as if and for. Being structured means that the control flow has a structure unlike, for example, gotos or asserts.
- [CF](https://mlir.llvm.org/docs/Dialects/ControlFlowDialect/): This dialect contains low-level, i.e. non-region based, control flow constructs. These constructs generally represent control flow directly on SSA blocks of a control flow graph.
- [LLVM](https://mlir.llvm.org/docs/Dialects/LLVM/): This dialect maps LLVM IR into MLIR by defining the corresponding operations and types. LLVM IR metadata is usually represented as MLIR attributes, which offer additional structure verification.
- [GPU](https://mlir.llvm.org/docs/Dialects/GPU/): This dialect provides middle-level abstractions for launching GPU kernels following a programming model similar to that of CUDA or OpenCL.
- [Arith](https://mlir.llvm.org/docs/Dialects/ArithOps/): The arith dialect is intended to hold basic integer and floating point mathematical operations. This includes unary, binary, and ternary arithmetic ops, bitwise and shift ops, cast ops, and compare ops. Operations in this dialect also accept vectors and tensors of integers or floats.
- [TOSA](https://mlir.llvm.org/docs/Dialects/TOSA/): TOSA was developed after parallel efforts to rationalize the top-down picture from multiple high-level frameworks, as well as a bottom-up view of different hardware target concerns (CPU, GPU and NPU), and reflects a set of choices that attempt to manage both sets of requirements.
- [Func](https://mlir.llvm.org/docs/Dialects/Func/): This dialect contains operations surrounding high order function abstractions, such as calls.

You can also [make your own dialect](https://mlir.llvm.org/docs/Tutorials/CreatingADialect/), useful to make a domain specific language for example, in this dialect you can define transformations to other dialects, passes, etc.

All these dialects can exist in your MLIR code at the same time, but at the end, you want to execute your code, for this there are Targets, one is LLVM IR itself. In this case, you would need to use passes to convert all dialects to the LLVM dialect, and then you can make the [translation from MLIR to LLVM IR](https://mlir.llvm.org/docs/TargetLLVMIR/).

The structure of MLIR is recursive as follows:

```
Region -> Block(s) -> Operation(s) -> Region(s)
```

The top level module is also a operation, which holds a single region with a single block.

A region can have 1 or more blocks, each block can have one or more operations, a operation can use 1 or more regions.

## Operations

These provides the functionality, and what make up the bulk of MLIR.

A operation has the following properties:

- Name: The name of the operation, a unique identified within MLIR. Operations live within a dialect, so they are refered to using `dialect.operation`,
for example `arith.add`
- Traits: A operation can have a set of traits that affect the syntax or semantics, for example, whether it has side effects,
whether it's a block terminator, etc.
- Constraints: These are used when verifying a operation is correct, for example whether the operands have matching shape and types.
- Arguments: There are 2 types of arguments: operands, which are runtime values, and attributes, which are compile time constant values.
- Regions: A operation can accept regions, which contain blocks within.
- Results: The results of the operation, which can be more than 1. For example `arith.add` has 1 result, defined by the type of it's arguments.
- Successors: When a operation is a terminator it needs successors, for example `cf.br` which is a unconditional jump and thus a branching operation, accepts a single successor (block).

You can read more about operations in the [Operation Definition Specification](https://mlir.llvm.org/docs/DefiningDialects/Operations/).

To use MLIR with Rust, I recommend [melior](https://github.com/raviqqe/melior), here is a snippet making a function that adds 2 numbers:

```rust
use melior::{
    Context,
    dialect::{arith, DialectRegistry, func},
    ir::{*, attribute::{StringAttribute, TypeAttribute}, r#type::FunctionType},
    utility::register_all_dialects,
};

// We need a registry to hold all the dialects
let registry = DialectRegistry::new();
// Register all dialects that come with MLIR.
register_all_dialects(&registry);

// The MLIR context, like the LLVM one.
let context = Context::new();
context.append_dialect_registry(&registry);
context.load_all_available_dialects();

// A location is a debug location like in LLVM, in MLIR all
// operations need a location, even if its "unknown".
let location = Location::unknown(&context);

// A MLIR module is akin to a LLVM module.
let module = Module::new(location);

// A integer-like type with platform dependent bit width. (like size_t or usize)
// This is a type defined in the Builtin dialect.
let index_type = Type::index(&context);

// Append a `func::func` operation to the body (a block) of the module.
// This operation accepts a string attribute, which is the name.
// A type attribute, which contains a function type in this case.
// Then it accepts a single region, which is where the body
// of the function will be, this region can have
// multiple blocks, which is how you may implement
// control flow within the function.
// These blocks each can have more operations.
module.body().append_operation(func::func(
    &context,
    // accepts a StringAttribute which is the function name.
    StringAttribute::new(&context, "add"),
    // A type attribute, defining the function signature.
    TypeAttribute::new(
            FunctionType::new(&context, &[index_type, index_type], &[index_type]).into()
        ),
    {
        // The first block within the region, blocks accept arguments
        // In regions with control flow, MLIR leverages
        // this structure to implicitly represent
        // the passage of control-flow dependent values without the complex nuances
        // of PHI nodes in traditional SSA representations.
        let block = Block::new(&[(index_type, location), (index_type, location)]);

        // Use the arith dialect to add the 2 arguments.
        let sum = block.append_operation(arith::addi(
            block.argument(0).unwrap().into(),
            block.argument(1).unwrap().into(),
            location
        ));

        // Return the result using the "func" dialect return operation.
        block.append_operation(
            func::r#return( &[sum.result(0).unwrap().into()], location)
        );

        // The Func operation requires a region,
        // we add the block we created to the region and return it,
        // which is passed as an argument to the `func::func` function.
        let region = Region::new();
        region.append_block(block);
        region
    },
    &[],
    location,
));

assert!(module.as_operation().verify());
```

Here is a more complex function, using the `SCF` dialect, which allows us to use a `while` loop:

```rust
let context = Context::new();
load_all_dialects(&context);

let location = Location::unknown(&context);
let module = Module::new(location);
let index_type = Type::index(&context);
let float_type = Type::float64(&context);

module.body().append_operation(func::func(
    &context,
    StringAttribute::new(&context, "foo"),
    TypeAttribute::new(FunctionType::new(&context, &[], &[]).into()),
    {
        let block = Block::new(&[]);

        let initial = block.append_operation(arith::constant(
            &context,
            IntegerAttribute::new(0, index_type).into(),
            location,
        ));

        block.append_operation(scf::r#while(
            &[initial.result(0).unwrap().into()],
            &[float_type],
            {
                let block = Block::new(&[(index_type, location)]);

                let condition = block.append_operation(arith::constant(
                    &context,
                    IntegerAttribute::new(0, IntegerType::new(&context, 1).into())
                        .into(),
                    location,
                ));

                let result = block.append_operation(arith::constant(
                    &context,
                    FloatAttribute::new(&context, 42.0, float_type).into(),
                    location,
                ));

                block.append_operation(scf::condition(
                    condition.result(0).unwrap().into(),
                    &[result.result(0).unwrap().into()],
                    location,
                ));

                let region = Region::new();
                region.append_block(block);
                region
            },
            {
                let block = Block::new(&[(float_type, location)]);

                let result = block.append_operation(arith::constant(
                    &context,
                    IntegerAttribute::new(42, Type::index(&context)).into(),
                    location,
                ));

                block.append_operation(scf::r#yield(
                    &[result.result(0).unwrap().into()],
                    location,
                ));

                let region = Region::new();
                region.append_block(block);
                region
            },
            location,
        ));

        block.append_operation(func::r#return(&[], location));

        let region = Region::new();
        region.append_block(block);
        region
    },
    &[],
    location,
));

assert!(module.as_operation().verify());
```

This code generates the following MLIR IR:

```mlir
module {
  func.func @foo() {
    %c0 = arith.constant 0 : index
    %0 = scf.while (%arg0 = %c0) : (index) -> f64 {
      %false = arith.constant false
      %cst = arith.constant 4.200000e+01 : f64
      scf.condition(%false) %cst : f64
    } do {
    ^bb0(%arg0: f64):
      %c42 = arith.constant 42 : index
      scf.yield %c42 : index
    }
    return
  }
}
```

There is way more to MLIR, but this is meant to be a small introduction.
