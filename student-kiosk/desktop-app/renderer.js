// Socket.io client connection
const socket = io("http://localhost:5000"); // Change URL as per your backend

let pc = null;

// On socket connected
socket.on("connect", () => {
  console.log("Socket connected:", socket.id);
});

// Listen for start live stream command
socket.on("start-live-stream", async () => {
  console.log("Received start-live-stream");
  if (pc) {
    console.warn("Already streaming!");
    return;
  }
  try {
    // Capture screen stream
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // Add tracks to peer connection
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // Ice candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtc-ice-candidate", { candidate: event.candidate });
      }
    };

    // Create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("webrtc-offer", { offer });
  } catch (error) {
    console.error("Failed to capture screen for streaming:", error);
  }
});

// Listen for WebRTC answer from server/admin
socket.on("webrtc-answer", async ({ answer }) => {
  if (!pc) {
    console.warn("PeerConnection not initialized yet");
    return;
  }
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

// Listen for ICE candidate from server/admin
socket.on("webrtc-ice-candidate", async ({ candidate }) => {
  if (!pc) return;
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    console.error("Error adding received ice candidate", e);
  }
});

// Listen for stop live stream command
socket.on("stop-live-stream", () => {
  if (pc) {
    pc.close();
    pc = null;
  }
  console.log("Stopped live stream");
});
