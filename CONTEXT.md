# Docksnip

Docksnip is a temporary visual staging area for moving images from their source into a browser-based destination without creating download clutter or a permanent image library.

## Language

**Visual Clipboard**:
The product category Docksnip occupies: a visible, persistent-until-discarded staging surface for one or more images that may be copied repeatedly into other places.
_Avoid_: Screenshot manager, image library, asset manager

**Dock**:
The temporary staging area containing images and collections that have not yet been discarded.
_Avoid_: Library, archive, file manager

**Capture**:
An image temporarily held in the Dock, whether created from a screen selection or collected from a webpage.
_Avoid_: File, asset, document

**Folder**:
An unnamed, flat, ordered set of captures intended to be dragged to a destination together. A Folder may be empty, occupies one position in the Dock when closed, belongs only to the Dock, and cannot contain another Folder.
_Avoid_: Collection, album, named group

**Destination**:
An application or input where a user attempts to place one capture or a Folder.
_Avoid_: Storage location, archive

**Delivery**:
The placement of every requested capture into a Destination's upload or composition interface. Sending, publishing, or submitting those captures is outside Docksnip.
_Avoid_: Send, publish, submit

**Delivery Attempt**:
A user-initiated drag or copy toward a Destination. Docksnip does not infer from an attempt that the Destination accepted the captures.
_Avoid_: Used, delivered, completed

**Discard**:
Explicitly deleting a capture or Folder from the Dock. Discarding a Folder also discards every capture it contains; removing its final capture leaves the empty Folder in the Dock.
_Avoid_: Archive, consume

**Temporary**:
Describes the intended use of Dock contents rather than an automatic expiry policy. Captures and Folders persist until the user explicitly discards them.
_Avoid_: Ephemeral, session-only, auto-expiring

**Compaction**:
The Dock's deliberate reduction in item size as it fills. Compaction continues as the Dock becomes crowded, intentionally making accumulated clutter less comfortable and encouraging the user to discard it. Compaction does not imply an internally scrolling Dock.
_Avoid_: Storage limit, expiry, overflow error
