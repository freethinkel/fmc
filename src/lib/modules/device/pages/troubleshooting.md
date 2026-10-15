# Before you connect

FMC talks to your watch straight from the browser, with no phone app in between. This page covers what it can change on the watch, what it can't, and the two problems people actually run into.

## What FMC can and cannot do

- **It cannot write firmware.** The protocol FMC speaks has one firmware command, and it only asks the watch which version it runs. There is nothing that writes. You can check this yourself in [`ble-protocol.ts`](https://github.com/freethinkel/fmc/blob/main/src/lib/modules/device/lib/ble-protocol.ts), where `fwGet` and `fwRet` are the whole firmware story.
- **It installs watchfaces through the watch's own installer.** The upload follows the same steps the official app takes. FMC starts an install, describes the file, sends it in chunks and finishes. The watch answers every step and can refuse the file. When it does, FMC shows you the refusal and stops.
- **The worst case we know of is a bad watchface.** The watch refuses it, or installs it and it looks wrong. Either way you delete it on the watch and move on.
- **We won't tell you nothing can go wrong.** We build and test FMC on a CMF Watch Pro 2. Firmware we haven't seen may behave differently, and we can't promise anything about it. If something breaks, [tell us](https://github.com/freethinkel/fmc/issues). The Nothing X fix below exists because someone did.

## Only one app can hold the watch at a time

The watch accepts a single Bluetooth connection. If Nothing X is connected, even in the background, **Connect** in FMC hangs and eventually times out. Close Nothing X or disconnect the watch inside it first.

It works the other way too. While an FMC tab holds the watch, Nothing X can't reach it. When you're done, close the tab or press **Forget device** in the watch panel. Two FMC tabs block each other the same way.

## Nothing X stopped seeing the watch after I used FMC

This one looks like a bricked watch. It isn't. The phone has a Bluetooth pairing conflict, and pairing again clears it.

1. Close the FMC tab so nothing holds the watch.
2. Turn Bluetooth off on the phone, wait a few seconds, turn it back on.
3. Forget the watch in the phone's Bluetooth settings.
4. Put the watch in pairing mode and add it again in Nothing X.

<p class="note">A user reported this in <a href="https://github.com/freethinkel/fmc/issues/27">issue #27</a>. Another user replied with these steps a few hours later, and nobody has needed a factory reset.</p>

## Deleting a watchface on the watch

You don't need FMC or Nothing X for this. Long-press the current face until the list of installed faces appears. Swipe to the one you want gone and swipe up on it.

The watch holds {WF_CAPACITY} watchfaces. Once they're all taken, FMC asks which one to overwrite. The factory faces count too, and Nothing X can reinstall them.

## When the watch refuses an upload

FMC shows what the watch said. Usually the watch is full, the slot you picked was removed in the meantime, or the watch rejected the finished file. Reconnect and try again. If the same face fails twice, the file is the problem, not the watch.

## Which browsers work

Connecting needs Web Bluetooth, which means Chrome or Edge on desktop, or Chrome on Android. Firefox doesn't support it. No browser on iOS does either. The editor still works there, you just can't install from it.

---

Did your watch do something this page doesn't describe? [Open an issue](https://github.com/freethinkel/fmc/issues) with your browser, the watch model and the firmware version shown in the watch panel. That's enough for us to reproduce it.
