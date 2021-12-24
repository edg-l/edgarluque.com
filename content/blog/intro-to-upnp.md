+++
title = "An intro to MiniUPNP"
description = "An intro to the MiniUPNP C library."
date = 2020-04-14
[taxonomies]
categories = ["c"]
+++

If you have a software that requires port forwarding, you may want to implement UPnP to make things easy for your end users.

When I wanted to implement it, the first library I found was [MiniUPnP](http://miniupnp.free.fr/files/), sadly it doesn't have  much documentation but a quick look at the header files and some examples on the internet I managed to make it work, here is how:

First the required include directives we need:

```c
#include <miniupnpc/miniupnpc.h>
#include <miniupnpc/upnpcommands.h>
#include <miniupnpc/upnperrors.h>
#include <stdio.h>
```

The first thing we need to do is discover the UPnP devices on the network, this is done using `upnpDiscover`:

```c
int main() {
  struct UPNPDev *upnp_dev = 0;

  int error = 0;
  upnp_dev = upnpDiscover(2000, NULL, NULL, 0, 0, 2, &error);

  if(error != 0) {
    printf("error discovering upnp devices: %s\n", strupnperror(error));
    return 1;
  }
}
```

Then we need to retrieve the Internet Gateway Device we discovered:

```c
struct UPNPUrls upnp_urls;
struct IGDdatas upnp_data;
char aLanAddr[64];
const char *pPort = "8000";

// Retrieve a valid Internet Gateway Device
int status = UPNP_GetValidIGD(
    upnp_dev,
    &upnp_urls,
    &upnp_data,
    aLanAddr,
    sizeof(aLanAddr)
    );
printf("status=%d, lan_addr=%s\n", status, aLanAddr);
```

We check if we got the correct status and then map the port.
We also declare the port we want to use, in this case I use the same number for the internal and external ports:

```c
if (status == 1)
{
    printf("found valid IGD: %s\n", upnp_urls.controlURL);
    error =
        UPNP_AddPortMapping(
            upnp_urls.controlURL,
            upnp_data.first.servicetype,
            pPort, // external port
            pPort, // internal port
            aLanAddr, "My Application Name", "UDP",
            0,  // remote host
            "0" // lease duration, recommended 0 as some NAT
            // implementations may not support another value
        );

    if (error)
    {
        printf("failed to map port\n");
        printf("error: %s\n", strupnperror(error));
    }
    else
        printf("successfully mapped port\n");
}
else
    printf("no valid IGD found\n");
```

Now the port is mapped, at this point you can open a socket bound to the internal port and external clients will be able to connect using the external port.

Then we do some cleanup:

*Note: The port here is the external one.*

```c
error = UPNP_DeletePortMapping(upnp_urls.controlURL,
                               upnp_data.first.servicetype,
                               pPort,
                               "UDP",
                               0);

if (error != 0) {
    printf("port map deletion error: %s\n", strupnperror(error));
}

FreeUPNPUrls(&upnp_urls);
freeUPNPDevlist(upnp_dev);
return 0;
```

Complete source code: [gist](https://gist.github.com/edg-l/98241d2ef929661f0bb20136ebda16cd)

Compiled using: `cc -lminiupnpc upnp.c`