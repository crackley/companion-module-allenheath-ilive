# Allen & Heath iLive Module

This module allows you to control Allen & Heath iLive mixing consoles using Bitfocus Companion.

## Technical Notes

This module assumes that your iLive console's MIDI channel is set to 1 (default). All MIDI commands are sent on this channel. If your console is configured to use a different MIDI channel, this module will not function correctly.

## Configuration

* **Target IP** - Enter the IP address of your iLive console
* **Poll Interval** - How often to poll for channel names (0-60 seconds, default: 1, set to 0 to disable)
* **Max Channel to Poll** - Highest channel number to poll for names (1-64, default: 32)

## Supported Actions

* **Set Fader Level** (-54dB to +10dB)
* **Mute/Unmute Channels** (channels 1-64, FX Send/Return 1-8, Mix 1-32, DCA 1-16)
* **Recall Scenes** (scenes 1-250)
* **Poll Channel Names** (manually request all channel names from the mixer)

## Channel Types

The module supports the following channel types:
* Input Channels (1-64)
* FX Send Channels (1-8)
* FX Return Channels (1-8)
* Mix Channels (1-32)
* DCA Channels (1-16)

## Channel Name Polling

The module automatically polls the iLive console for channel names at a configurable interval. This ensures that your button labels and variables stay in sync with the console's current channel names.

If automatic polling is disabled (Poll Interval set to 0), you can use the "Poll Channel Names" action to manually request channel names when needed.

## Available Variables

The following variables can be used in your button text:

* **$(ilive:ch_X_name)** - Name of input channel X (where X is 1-64)
* **$(ilive:fx_send_X_name)** - Name of FX Send X (where X is 1-8)
* **$(ilive:fx_return_X_name)** - Name of FX Return X (where X is 1-8)
* **$(ilive:mix_X_name)** - Name of Mix X (where X is 1-32)
* **$(ilive:dca_X_name)** - Name of DCA X (where X is 1-16)

## Technical Details

* Uses MIDI over TCP for communication (fixed port 51325)
* Supports up to:
  * 64 input channels
  * 8 FX Send channels
  * 8 FX Return channels
  * 32 Mix channels
  * 16 DCA channels
* Scene recall via MIDI program change messages
* Automatic reconnection on connection loss
* Efficient SysEx message handling for channel name retrieval

## Actions

### Fader Level
Sets the level of a channel's fader. The MIDI command format is:
```
B0 63 CH 62 17 06 LV
```
Where:
- CH is the channel number:
  * 0x20-0x5F for input channels 1-64
  * 0x00-0x07 for FX Send channels 1-8
  * 0x08-0x0F for FX Return channels 1-8
  * 0x60-0x7F for Mix channels 1-32
  * 0x10-0x1F for DCA channels 1-16
- LV is calculated from the dB value using: `midi = ((dB + 54) * 127) / 64`

### Channel Mute
Mutes or unmutes a channel. The MIDI command formats are:
```
Mute:   90 CH 7F CH 00
Unmute: 90 CH 3F CH 00
```
Where CH is the channel number (same ranges as Fader Level)

### Scene Recall
Recalls a scene. The MIDI command format depends on the scene number:
```
Scenes 1-128:   B0 00 00 C0 SS
Scenes 129-250: B0 00 01 C0 SS
```
Where SS is the scene number (0-127 for bank 0, 0-121 for bank 1)

### Poll Channel Names
Manually requests all channel names from the mixer. This is useful when automatic polling is disabled (Poll Interval set to 0). The module will request names for all channel types:
- Input channels (1-64)
- FX Send channels (1-8)
- FX Return channels (1-8)
- Mix channels (1-32)
- DCA channels (1-16)

## Support

For support, please visit:
* [Companion User Guide](https://bitfocus.io/companion/)
* [Allen & Heath iLive Support](https://www.allen-heath.com/support/)
