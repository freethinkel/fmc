# Before you connect

FMC talks to your watch straight from the browser, with no phone app in between. This page covers what it can change on the watch, what it can't, and the two problems people actually run into.

## What FMC can and cannot do

- **It cannot write firmware.** The protocol FMC speaks has one firmware command, and it only asks the watch which version it runs. There is nothing that writes. You can check this yourself in [`ble-protocol.ts`](https://github.com/freethinkel/fmc/blob/main/src/lib/modules/device/lib/ble-protocol.ts), where `fwGet` and `fwRet` are the whole firmware story.
- **It installs watchfaces through the watch's own installer.** The upload follows the same steps the official app takes. FMC starts an install, describes the file, sends it in chunks and finishes. The watch answers every step and can refuse the file. When it does, FMC shows you the refusal and stops.
- **A bad watchface is the worst case we know of, and it can be bad.** Usually the watch refuses the file, or installs it and it looks wrong, and you delete it on the watch. Once, a face with an image far larger than the screen made a Watch 3 Pro restart in a loop. See "The watch restarts in a loop" below.
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

A Watch Pro 2 holds {WF_CAPACITY} watchfaces, a Watch 3 Pro {WF_CAPACITY_PRO3}. Once they're all taken, FMC asks which one to overwrite. The factory faces count too, and Nothing X can reinstall them.

## The watch restarts in a loop

The watch has to hold every image of a face in memory. A face with a 1386×1386 image, three times the screen, ran a CMF Watch 3 Pro out of memory: it showed the logo, went black and restarted, again and again, and nothing could connect to it.

FMC now prevents this in two places. Images you add in the editor are scaled down to fit the screen. Before any install, FMC also checks the file and refuses it if an image is more than {MAX_IMAGE_SIDE} px on a side, wherever the file came from.

A second loop shows up only on the always-on display: the screen flashes to full brightness over and over until you switch to a factory face. The face reported doing this on a Watch 3 Pro had lost the small thumbnail every factory always-on screen carries. That is our best lead, not a confirmed cause. FMC now refuses a file like that before the install, and the editor puts the thumbnail back, so open the face in the editor and install it from there.

If your watch is already stuck in the loop, we don't have a confirmed fix yet. These are the things worth trying, in order:

1. Right after it restarts, keep the screen awake by tapping it. The large image in the reported case was the always-on one, so the crash may only come when the screen dims.
2. If the face shows up even briefly, long-press it and swipe it away. If you have time, also turn off the always-on display in settings.
3. Let the battery run out completely, then charge it and try again.
4. If none of that works, contact Nothing support. The firmware itself is untouched, so this is a repair they can do.

<p class="note">If one of these steps worked for you, or something else did, please <a href="https://github.com/freethinkel/fmc/issues">tell us</a> so we can put it at the top of this list.</p>

## When the watch refuses an upload

FMC shows what the watch said. Usually the watch is full, the slot you picked was removed in the meantime, or the watch rejected the finished file. Reconnect and try again. If the same face fails twice, the file is the problem, not the watch.

## Which browsers work

Connecting needs Web Bluetooth, which means Chrome or Edge on desktop, or Chrome on Android. Firefox doesn't support it. No browser on iOS does either. The editor still works there, you just can't install from it.

---

Did your watch do something this page doesn't describe? [Open an issue](https://github.com/freethinkel/fmc/issues) with your browser, the watch model and the firmware version shown in the watch panel. That's enough for us to reproduce it.
