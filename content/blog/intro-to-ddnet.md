+++
title = "An intro to the DDraceNetwork game source code"
description = "An introduction to the ddnet source code."
date = 2020-11-03
+++

## What is DDraceNetwork?

It's an open source mod of [teeworlds](https://teeworlds.com/) which was released on [steam](https://store.steampowered.com/app/412220/DDraceNetwork/) not long ago.

The language used is C++ along with some python scripts to generate the network protocol, it uses [CMake](https://cmake.org/) for building.

It's made on top of SDL2 with a custom OpenGL renderer.

The source can be located here: [github.com/ddnet/ddnet](https://github.com/ddnet/ddnet)

## My story on DDNet
This mod, also called ddnet was a breaking point on my path towards learning and improving my programming skills, since it introduced me to a codebase quite larger than what I was used to, if I'm honest, the first time I tried to do something in it, I was overwhelmed, but after some hardships and help from a [friend](https://timakro.de/) I got more used to it.

## The basic layout
The code of the game is located in the `src` directory, here I highlight the important directories it has:


### - `src/base`
This contains the system.h and system.c files, which is kind of an abstraction layer over the standard library, it also contains most platform specific code.

Here you can find functions for string formatting, memory and thread management and some cryptography stuff.

You will mostly never touch these files, but they are used a lot.

There is a subfolder in base named "tl", it contains an implementation for algorithm and array, but we are currently planning to move away from this.

### - `src/engine`
Here lives the code for anything that is not game specific (or kinda, it's not crystal clear actually), you can find the implementation for the graphics backend, sound, input, notifications, networking, console, SQL, etc.

If your objective is to make a mod, you will probably not touch this folder either.

### - `src/game`
Here you will find the code that implements the client and the server.

In the base folder you can find:

`collision.cpp`: Collision related code.

`ddracecommands.h`: Rcon commands.

`gamecore.cpp`:

Implements the physics, changing this means the community will cry at you because physics bugs are used in actual maps (so as we say, our physics have no bugs only features).

`layers.cpp`: Map layers.

`mapbugs.cpp`:

A try into fixing the physics "bugs", what it does is preserve the bug in specific maps that use them and fix them for new maps.

Currently, the only "bug" preserved with this is a double grenade explosion bug used in the map [binary](https://ddnet.tw/maps/Binary).

### - `src/game/client`
Client specific code, the client is made up of components, each component is a class that extends `CComponent`, with this, you can [access](https://github.com/ddnet/ddnet/blob/e256b11d367d001f0baf3905ab78e21ae2747718/src/game/client/component.h#L21) the kernel, graphics, text rendering, sound, console; basically most of the stuff implemented in the engine.

Components may also implement methods which will be called on a particular [event](https://github.com/ddnet/ddnet/blob/e256b11d367d001f0baf3905ab78e21ae2747718/src/game/client/component.h#L61), such as *OnRender*, *OnInit*, *OnInput*.

The file `gameclient.cpp` implements the game client, which has all the logic behind handling the components, receiving network [packets](https://github.com/ddnet/ddnet/blob/e256b11d367d001f0baf3905ab78e21ae2747718/src/game/client/gameclient.cpp#L752) and more.

### - `src/game/server`
Server specific code, it keeps track of everything, players and all the entities.

In `gamecontext.cpp` `CGameContext` is implemented, it's the heart of the server, it handles lots of stuff like chat, clients, map changes, network messages, commands, moderation, etc.

`CGameContext` is not only implemented in this file, it also has some parts implemented in `ddracecommands.cpp` for example.

The `gamecontroller.cpp` handles player spawns, some map entities, it also sends the gameinfo packet.

The`gameworld.cpp` tracks all the entities in the game.

In `player.cpp` you can find the class `CPlayer` that keeps track of a player, it stores any information related to the player that is not related to physics.

One of the most important entities is `CCharacter`, it keeps track of the physical representation of the player (we call them "tee(s)"), it's destroyed on death and created when spawning by `CPlayer`. There are also more entities like pickups, laser, projectile, etc...


## More to come
There is lot more stuff in here, and the best way to learn it is by actually implementing things.

I plan on making this a series of posts implementing stuff to the game (useful or not), here is a sneak peak of whats to come:

- [Code conventions and basic stuff](/blog/code-conventions-in-ddnet).
- [Implementing a chat command](/blog/chat-command-ddracenetwork)
- Implementing a rcon command
- Adding configuration options to the client.
- Modify the menus to show a label and a button/checkbox/slider for the previously added options.
- Add a new network packet.
- Add a new map tile.
- Any other idea I may get in the future.