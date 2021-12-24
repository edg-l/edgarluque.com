+++
title = "Creating precompiled headers with cmake"
description = "A brief introduction to target_precompile_headers"
date = 2020-11-12
[taxonomies]
categories = ["cmake"]
+++

## What are precompiled headers?
They are a partially processed version of header files, this speeds up compilation because it doesn't have to repeatedly parse the original header.

## How to use it

The way to do it is to pass the header files you want precompiled to the `target_precompile_headers` command.

Imagine this folder structure:

```
.
├── CMakeLists.txt
└── src
    ├── header.h
    └── main.cpp

1 directory, 3 files
```

Now we create a very basic CMakeLists.txt:

```cmake
cmake_minimum_required(VERSION 3.16)

project(MyProject)

set(HEADER_FILES
	src/header.h)

set(SOURCE_FILES
	src/main.cpp
	${HEADER_FILES}
	)

include_directories(src)

add_executable(MyProject ${SOURCE_FILES})
```

Notice we require a minimum cmake version of 3.16, this is due to `target_precompile_headers` being added in that version.

We add the command after the `add_executable` instruction to the private scope.

It's recommended to use the private scope to prevent precompiled headers appearing in an installed target, consumers should decide whether they want to use precompiled headers or not.

```cmake
target_precompile_headers(MyProject PRIVATE ${HEADER_FILES})
```

When compiling you can see now that it indeed compiles the headers:

```
Scanning dependencies of target MyProject
[ 33%] Building CXX object CMakeFiles/MyProject.dir/cmake_pch.hxx.gch
[ 66%] Building CXX object CMakeFiles/MyProject.dir/src/main.cpp.o
[100%] Linking CXX executable MyProject
[100%] Built target MyProject
```
