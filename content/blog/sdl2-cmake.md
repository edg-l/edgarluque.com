+++
title = "Setting Up SDL2 with CMake"
description = "How to setup and use SDL2 using the CMake build tool."
date = 2019-04-27
+++

## Installing CMake

Most common distributions have cmake available on their package manager repostories:

```bash
# Debian based
sudo apt install cmake

# Arch
pacman -S cmake
```

## Install SDL2 libraries

I only know about the debian based ones, if you are on another distro you should look them up.

```bash
sudo apt install libsdl2-dev libsdl2-image-dev libsdl2-mixer-dev libsdl2-net-dev libsdl2-ttf-dev libsdl2-gfx-dev
```

## Directory Structure

Here is a common directory structure when using cmake to find packages:

```
├── cmake
│   ├── FindSDL2.cmake
│   ├── FindSDL2_mixer.cmake
│   └── FindSDL2_net.cmake
├── CMakeLists.txt
└── src
    └── main.cpp
```

You can find the cmake files to find SDL2 and it's components
[here](https://github.com/aminosbh/sdl2-cmake-modules)

Or you can use this simple command:

```bash
cd cmake
wget https://raw.githubusercontent.com/aminosbh/sdl2-cmake-modules/master/FindSDL2{,_gfx,_image,_mixer,_net,_ttf}.cmake
```

## Creating the CMakeLists.txt file

```cmake
cmake_minimum_required(VERSION 3.13)
project(MyProject)

# Needed so that cmake uses our find modules.
list(APPEND CMAKE_MODULE_PATH ${CMAKE_CURRENT_SOURCE_DIR}/cmake)

find_package(SDL2 REQUIRED)
find_package(SDL2_net REQUIRED)
find_package(SDL2_mixer REQUIRED)
find_package(SDL2_image REQUIRED)
find_package(SDL2_gfx REQUIRED)
find_package(SDL2_ttf REQUIRED)


set(SOURCE_FILES
    src/main.cpp
    )

include_directories(src)

add_executable(MyProject ${SOURCE_FILES})
target_link_libraries(MyProject SDL2::Main SDL2::Net SDL2::Mixer SDL2::Image SDL2::TTF SDL2::GFX)

```

And thats it! Now you can remove the SDL2 components you don't want to use.

## Building

Following the standard cmake procedure:

```bash
mkdir build
cd build
cmake ..
make -j${nproc}
```