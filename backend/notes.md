get capabilities

for each user

- create transport -> send the transport params to the client
- client creates a client transport with server params
- client will initiate transport connect; server receives the dtls paramters and tries to connect using them
- client will send produce event; BE will create a producer and send the producer id to the client
- server wills send new producer event to all clients
- client will send a consumer event; BE will create a consumer and send the consumer id to the client

```bash
ffmpeg \
-protocol_whitelist file,udp,rtp \
# Explanation: Specifies the allowed protocols for input.
# Required when using an SDP file (`-i stream.sdp`) that describes RTP/UDP streams.
# FFmpeg needs explicit permission to use these non-file protocols for security.

-re \
# Explanation: Read input at native frame rate.
# Highly recommended for live inputs like RTP streams.
# Without it, FFmpeg might process the input as fast as possible,
# which is unsuitable for live streaming and can cause issues with timing and HLS segment generation.

-i stream.sdp \
# Explanation: Specifies the input file.
# Required. In this case, it's the SDP (Session Description Protocol) file
# that describes the incoming RTP streams from Mediasoup (User 1's audio/video, User 2's audio/video).

-filter_complex " \
  [0:v:0]scale=320:360,setsar=1[v_user1]; \
  [0:v:1]scale=320:360,setsar=1[v_user2]; \
  [v_user1][v_user2]hstack=inputs=2[vout]; \
  [0:a:0][0:a:1]amix=inputs=2:duration=first:dropout_transition=3[aout] \
" \
# Explanation: Defines a complex filtergraph for processing audio and video.
# Required for combining multiple video streams into one layout and mixing multiple audio streams.
#   `[0:v:0]`: Selects the video stream (v) from the first input file (0, which is stream.sdp),
#              and specifically the first video track (0) described within that SDP for input 0.
#              (Assumes User 1's video is the first video m-line in the SDP).
#   `scale=320:360,setsar=1`: Scales the selected video to 320x360 pixels and sets its
#                             Sample Aspect Ratio to 1:1 (square pixels) to prevent distortion.
#   `[v_user1]`: Labels the output of this scaling operation as 'v_user1'.
#   `[0:v:1]`: Selects the second video track (1) from the first input file (0).
#              (Assumes User 2's video is the second video m-line in the SDP).
#   `[v_user1][v_user2]hstack=inputs=2[vout]`: Takes the two labeled scaled video streams
#                                             ('v_user1', 'v_user2') and stacks them
#                                             horizontally (side-by-side).
#                                             The output of this horizontal stack is labeled 'vout'.
#   `[0:a:0]`: Selects the audio stream (a) from the first input file (0), first audio track (0).
#              (Assumes User 1's audio is the first audio m-line).
#   `[0:a:1]`: Selects the second audio track (1) from the first input file (0).
#              (Assumes User 2's audio is the second audio m-line).
#   `amix=inputs=2:duration=first:dropout_transition=3[aout]`: Mixes the two selected audio streams.
#     `inputs=2`: Specifies that two audio inputs are being mixed.
#     `duration=first`: The mixing process stops when the first input stream ends.
#     `dropout_transition=3`: Specifies the transition duration (in seconds) when an input stream drops out.
#     `[aout]`: Labels the output of the audio mixing as 'aout'.

-map "[vout]" \
# Explanation: Maps a stream from the input or filtergraph to an output stream.
# Required. This tells FFmpeg to use the stream labeled '[vout]' (our combined video from filter_complex)
# as a video stream in the output file.

-map "[aout]" \
# Explanation: Similar to the video map.
# Required. This tells FFmpeg to use the stream labeled '[aout]' (our mixed audio from filter_complex)
# as an audio stream in the output file.

-c:v libx264 \
# Explanation: Sets the video codec for the output.
# Required for HLS. `libx264` is the H.264 encoder, which is standard for HLS.

-preset veryfast \
# Explanation: A preset for `libx264` that balances encoding speed and compression.
# Highly Recommended for live streaming. `veryfast` or `ultrafast` are common.
# Slower presets (`medium`, `slow`) give better quality/compression but use more CPU.

-tune zerolatency \
# Explanation: Optimizes `libx264` settings for low-latency streaming.
# Highly Recommended for live scenarios to reduce delay.

-pix_fmt yuv420p \
# Explanation: Sets the output pixel format.
# Highly Recommended. `yuv420p` is the most common and compatible pixel format for H.264 video
# and ensures broad playback compatibility.

-g 60 \
# Explanation: Sets the GOP (Group Of Pictures) size, which is the keyframe interval.
# Recommended for HLS. A keyframe every `N` frames. If your input is ~30fps, `-g 60` means
# a keyframe approximately every 2 seconds. HLS segments should ideally start with a keyframe.
# This value should generally be `input_fps * hls_time / N` where N is an integer, or simply `input_fps * desired_keyframe_interval_seconds`.

-c:a aac \
# Explanation: Sets the audio codec for the output.
# Required for HLS. AAC (Advanced Audio Coding) is the standard audio codec for HLS.

-b:a 128k \
# Explanation: Sets the audio bitrate.
# Recommended. `128k` (128 kbps) is a common bitrate for good quality stereo audio.
# Adjust based on desired quality and bandwidth.

-f hls \
# Explanation: Sets the output format to HLS (HTTP Live Streaming).
# Required. This tells FFmpeg to package the output into HLS segments and a playlist.

-hls_time 4 \
# Explanation: Sets the target duration of each HLS segment in seconds.
# Required. A common value is between 2 to 10 seconds. Shorter segments mean lower latency
# but more overhead.

-hls_list_size 5 \
# Explanation: Sets the maximum number of media segments to keep in the playlist file.
# Recommended for live streaming. `0` means keep all segments (for VOD).
# For live, a small number (e.g., 3-10) is typical.

-hls_flags delete_segments+omit_endlist \
# Explanation: Sets HLS specific flags.
#   `delete_segments`: Recommended for live. FFmpeg will delete old segment files
#                      that are no longer part of the playlist (older than hls_list_size).
#   `omit_endlist`: Required for live. Prevents FFmpeg from writing the `#EXT-X-ENDLIST`
#                   tag to the playlist, indicating that the stream is ongoing.

-hls_segment_filename ./public/hls/segment_%03d.ts \
# Explanation: Specifies the naming pattern for the output HLS media segment files.
# Required. `%03d` means a 3-digit sequence number (e.g., segment_000.ts, segment_001.ts).
# The path should point to a directory where your web server can serve these files.

./public/hls/live.m3u8
# Explanation: Specifies the path and filename for the output HLS master playlist file.
# Required. This is the file that HLS players will request to start playing the stream.
```

refined

````bash
ffmpeg \
-protocol_whitelist file,udp,rtp \
-re \
-i stream.sdp \
-filter_complex " \
  [0:v:0]scale=320:360,setsar=1[v_user1]; \
  [0:v:1]scale=320:360,setsar=1[v_user2]; \
  [v_user1][v_user2]hstack=inputs=2[vout]; \
  [0:a:0][0:a:1]amix=inputs=2:duration=first:dropout_transition=3[aout] \
" \
-map "[vout]" \
-map "[aout]" \
-c:v libx264 \
-c:a aac \
-f hls \
-hls_flags delete_segments+omit_endlist \
-hls_segment_filename ./public/hls/segment_%03d.ts \
./public/hls/live.m3u8```
````
