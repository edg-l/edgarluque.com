+++
title = "Gentoo as a daily driver"
date = 2023-05-15
description = "My experience using Gentoo"
[taxonomies]
categories = ["linux", "gentoo"]
+++

I've been using GNU/Linux for quite a while now, I don't remember exactly what my first distro was, probably Ubuntu or Debian.
I eventually switched to Arch Linux and stayed with it for a long time, I really enjoyed it, but I have a thing for trying new stuff, and eventually delved into it.

# Filesystem

Coming from an Arch Linux installation using LVM on LUKS, this time I decided it wasn't that worth it encrypting my whole disk, so I went a simpler way.

This is my `/etc/fstab` file:

```
# boot
UUID=8E37-E91C	/boot	vfat	defaults,noatime	0 2
# root, a 500gb NVME m2 ssd
UUID=6739c2cc-4a15-4a30-b223-bafcdff6688f / ext4 noatime 0 1

# a extra 2tb ssd partition
UUID=c598fbd0-b87c-4e69-9fb6-8b2fd0624f24 /data1 ext4 defaults,noatime 0 2

# 1tb hdd, which i don't really use
UUID=978e8a4d-a200-42ff-b501-ee25baf195d4 /data2 ext4 defaults,noatime 0 2

# swap
UUID=d2359c6c-99c0-4f4f-9225-5605bed37399 none swap sw 0 0

/dev/cdrom		/mnt/cdrom	auto		noauto,user	0 0

# tmpfs (RAM file system) for temp files and portage build files.
tmpfs /tmp tmpfs rw,nosuid,noatime,nodev,size=8G,mode=1777 0 0
tmpfs /var/tmp/portage tmpfs size=14G,uid=portage,gid=portage,mode=775,nosuid,noatime,nodev	0 0
```

As you can see it's just a traditional setup, using tmpfs for portage stuff, this way i save on SSD disk writes. I should note though that I have 32gb of RAM so I can afford this. For example, firefox requires the tmpfs to be atleast 4.5gb. You can read more [here](https://wiki.gentoo.org/wiki/Portage_TMPDIR_on_tmpfs).

# No Systemd

Since all the distros I used so far used systemd, I decided to try to avoid it this time, which I did for everything but `udev`, which I may replace for `eudev` someday.

OpenRc is really intuitive so far, I can't speak about writing a service file since i haven't had the need to do so yet.

# Desktop

I'm currently on X11, using i3 as my tiled window manager, alacritty as my terminal emulator and pipewire for the sound server. No problems whatsoever.

# Updating

I used to use the testing kernel, but I encountered some issues and the updates where pretty frequent, so I decided to use the non masked kernel.

To update my kernel I made a simple script:

```bash
sudo make -j16
sudo make install
sudo make modules_install
sudo emerge @module-rebuild
sudo dracut
# sudo grub-install --efi-directory=/boot/efi
sudo grub-mkconfig -o /boot/grub/grub.cfg
```

Configuring the kernel to my liking wasn't hard either, you just need some time to read through the options you need, you mostly will find out what you need by reading the packages wiki for the software you install, since they often list the kernel requirements.

To update my packages, I have two aliases:

```bash
alias update='sudo emaint -a sync'
alias upgrade='sudo emerge -avuDN @world'
```

# Creating a package

To my surprise, creating a ebuild is quite easy, specially if the software you package uses a common build system.

I am currently maintaining the [ddnet](https://github.com/ddnet/ddnet) ebuild, which uses a mix of cpp, rust, python, managed by cmake.

<https://gitweb.gentoo.org/repo/proj/guru.git/tree/games-action/ddnet?h=dev>

# Further thoughts

Something that I like about Gentoo is that, in my case, due to long compile times for (possibly bloated) software, you tend to avoid those, so
it forces you to try to minimize dependencies, find software that just does what you want, most probably without any GUI.

It's certainly a different experience compared to binary distributed distros. You can also enjoy the small performance benefits of building with everything with your native [ISA](https://en.wikipedia.org/wiki/Instruction_set_architecture).

