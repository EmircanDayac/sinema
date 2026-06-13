const socket = io('/');

const landingPage = document.getElementById('landing-page');
const roomPage = document.getElementById('room-page');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');

const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const mainVideo = document.getElementById('main-video');
const remoteWebcamContainer = document.getElementById('remote-webcam-container');
const waitingText = document.getElementById('waiting-text');

const micBtn = document.getElementById('mic-btn');
const cameraBtn = document.getElementById('camera-btn');
const screenBtn = document.getElementById('screen-btn');
const leaveBtn = document.getElementById('leave-btn');
const inviteBtn = document.getElementById('invite-btn');

const guideModal = document.getElementById('guide-modal');
const closeGuide = document.getElementById('close-guide');
const guideGotIt = document.getElementById('guide-got-it');
const guideOpenLanding = document.getElementById('guide-open-btn-landing');
const guideOpenRoom = document.getElementById('guide-open-btn-room');

function openGuide() {
    guideModal.classList.add('active');
}

function closeGuideModal() {
    guideModal.classList.remove('active');
}

guideOpenLanding.addEventListener('click', openGuide);
guideOpenRoom.addEventListener('click', openGuide);
closeGuide.addEventListener('click', closeGuideModal);
guideGotIt.addEventListener('click', closeGuideModal);

window.addEventListener('click', (e) => {
    if (e.target === guideModal) {
        closeGuideModal();
    }
});

let currentRoom = null;
let localStream = null;
let screenStream = null;
let peerConnection = null;
let remoteUserId = null;
let remoteScreenStreamId = null;

let isMicMuted = false;
let isCameraOff = false;
let isScreenSharing = false;

let makingOffer = false;
let ignoreOffer = false;
let polite = false;

let pendingStreams = {};
let remoteWebcamStreamId = null;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Start Local Media
async function startLocalMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error('Error accessing media devices.', err);
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            localVideo.srcObject = localStream;
            isCameraOff = true;
            cameraBtn.classList.remove('active');
            cameraBtn.innerHTML = "<i class='bx bx-video-off'></i>";
            alert("Kamera bulunamadı veya tam açılamadı, sadece ses ile bağlanıldı.");
        } catch (audioErr) {
            console.error('Audio also failed', audioErr);
            alert("Kamera ve mikrofon erişimine izin vermeniz gerekiyor.");
        }
    }
}

// Check URL Params
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');
if (roomParam) {
    roomInput.value = roomParam;
}

const createBtn = document.getElementById('create-btn');

// Join Room
joinBtn.addEventListener('click', async () => {
    const roomName = roomInput.value.trim();
    if (roomName) {
        currentRoom = roomName;
        await startLocalMedia();
        
        landingPage.classList.remove('active');
        roomPage.classList.add('active');

        socket.emit('join-room', currentRoom);
    }
});

// Create Room
createBtn.addEventListener('click', async () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'ODA-';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    currentRoom = code;
    await startLocalMedia();
    
    landingPage.classList.remove('active');
    roomPage.classList.add('active');

    socket.emit('join-room', currentRoom);

    // Otomatik kopyala
    const inviteLink = `${window.location.origin}/?room=${currentRoom}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
        alert("🎉 Yeni oda oluşturuldu!\n\nDavet linki otomatik kopyalandı. Arkadaşına hemen yapıştırıp gönderebilirsin.");
    }).catch(err => {
        alert("Oda oluşturuldu! Menüden 'Davet Linkini Kopyala' butonunu kullanabilirsiniz.");
    });
});

// Create Peer Connection
function createPeerConnection(remoteId) {
    if (peerConnection) {
        peerConnection.close();
    }
    
    screenSenders = [];
    peerConnection = new RTCPeerConnection(configuration);
    
    // Send our active stream IDs immediately
    if (localStream) {
        socket.emit('webcam-info', localStream.id);
    }
    if (isScreenSharing && screenStream) {
        socket.emit('screen-share-info', { streamId: screenStream.id });
    }
    
    // Add local webcam tracks
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // Add screen stream tracks if already sharing
    if (screenStream) {
        screenStream.getTracks().forEach(track => {
            const sender = peerConnection.addTrack(track, screenStream);
            screenSenders.push(sender);
        });
    }

    peerConnection.ontrack = (event) => {
        const stream = event.streams[0];
        
        if (remoteScreenStreamId === stream.id) {
            if (mainVideo.srcObject !== stream) {
                mainVideo.srcObject = stream;
                waitingText.style.display = 'none';
            }
        } else if (remoteWebcamStreamId === stream.id) {
            if (remoteVideo.srcObject !== stream) {
                remoteVideo.srcObject = stream;
                remoteWebcamContainer.style.display = 'block';
            }
        } else {
            // Keep it pending until we get the socket info
            pendingStreams[stream.id] = stream;
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', {
                to: remoteId,
                candidate: event.candidate
            });
        }
    };

    peerConnection.onnegotiationneeded = async () => {
        try {
            makingOffer = true;
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('signal', {
                to: remoteId,
                description: peerConnection.localDescription
            });
        } catch (err) {
            console.error('Error negotiating', err);
        } finally {
            makingOffer = false;
        }
    };
    
    return peerConnection;
}

// Socket Events
socket.on('user-connected', async (userId) => {
    console.log('User connected', userId);
    polite = false;
    remoteUserId = userId;
    createPeerConnection(userId);
});

socket.on('user-disconnected', (userId) => {
    console.log('User disconnected', userId);
    if (remoteUserId === userId) {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        remoteVideo.srcObject = null;
        remoteWebcamContainer.style.display = 'none';
        
        // Only clear mainVideo if it was showing the remote user's screen share
        if (mainVideo.srcObject && remoteScreenStreamId && mainVideo.srcObject.id === remoteScreenStreamId) {
            mainVideo.srcObject = null;
            waitingText.style.display = 'flex';
        }
        
        remoteUserId = null;
        remoteScreenStreamId = null;
    }
});

socket.on('signal', async (senderId, data) => {
    if (!peerConnection) {
        polite = true;
        remoteUserId = senderId;
        createPeerConnection(senderId);
    }

    try {
        if (data.description) {
            const offerCollision = (data.description.type === "offer") && (makingOffer || peerConnection.signalingState !== "stable");
            ignoreOffer = !polite && offerCollision;
            if (ignoreOffer) return;

            await peerConnection.setRemoteDescription(data.description);
            if (data.description.type === "offer") {
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit('signal', {
                    to: senderId,
                    description: peerConnection.localDescription
                });
            }
        } else if (data.candidate) {
            try {
                await peerConnection.addIceCandidate(data.candidate);
            } catch (err) {
                if (!ignoreOffer) console.error(err);
            }
        }
    } catch (err) {
        console.error('Error handling signal', err);
    }
});

socket.on('webcam-info', (id) => {
    remoteWebcamStreamId = id;
    if (pendingStreams[id]) {
        if (remoteVideo.srcObject !== pendingStreams[id]) {
            remoteVideo.srcObject = pendingStreams[id];
            remoteWebcamContainer.style.display = 'block';
        }
        delete pendingStreams[id];
    }
});

socket.on('screen-share-info', (data) => {
    remoteScreenStreamId = data.streamId;
    if (pendingStreams[data.streamId]) {
        if (mainVideo.srcObject !== pendingStreams[data.streamId]) {
            mainVideo.srcObject = pendingStreams[data.streamId];
            waitingText.style.display = 'none';
        }
        delete pendingStreams[data.streamId];
    }
});

socket.on('screen-share-stopped', () => {
    if (mainVideo.srcObject && remoteScreenStreamId && mainVideo.srcObject.id === remoteScreenStreamId) {
        mainVideo.srcObject = null;
        waitingText.style.display = 'flex';
    }
    remoteScreenStreamId = null;
});

// Room full
socket.on('room-full', () => {
    alert('Bu salon tamamen dolu! Sadece 2 kişi girebilir.');
    window.location.href = '/';
});

// Controls
inviteBtn.addEventListener('click', () => {
    const inviteLink = `${window.location.origin}/?room=${currentRoom}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
        alert("Davet linki kopyalandı! Arkadaşına gönderebilirsin.");
    }).catch(err => {
        console.error('Kopyalama hatası:', err);
    });
});

micBtn.addEventListener('click', () => {
    if (!localStream) return;
    isMicMuted = !isMicMuted;
    localStream.getAudioTracks()[0].enabled = !isMicMuted;
    
    if (isMicMuted) {
        micBtn.classList.remove('active');
        micBtn.innerHTML = "<i class='bx bx-microphone-off'></i>";
    } else {
        micBtn.classList.add('active');
        micBtn.innerHTML = "<i class='bx bx-microphone'></i>";
    }
});

cameraBtn.addEventListener('click', () => {
    if (!localStream) return;
    isCameraOff = !isCameraOff;
    localStream.getVideoTracks()[0].enabled = !isCameraOff;
    
    if (isCameraOff) {
        cameraBtn.classList.remove('active');
        cameraBtn.innerHTML = "<i class='bx bx-video-off'></i>";
    } else {
        cameraBtn.classList.add('active');
        cameraBtn.innerHTML = "<i class='bx bx-video'></i>";
    }
});

let screenSenders = [];

screenBtn.addEventListener('click', async () => {
    if (isScreenSharing) {
        stopScreenShare();
        return;
    }

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            alert("Cihazınız veya tarayıcınız ekran paylaşımını desteklemiyor. Lütfen güncel Chrome, Safari veya Edge kullanın.");
            return;
        }

        try {
            // First attempt: High fidelity settings (Desktop/Ideal)
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: { ideal: 60, max: 60 } },
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 48000,
                    channelCount: 2
                }
            });
        } catch (highQualityErr) {
            console.warn("Yüksek kalite ayarları desteklenmiyor, varsayılan ayarlara geçiliyor...", highQualityErr);
            
            try {
                // Second attempt: Basic video and audio (Some mobiles/tablets)
                screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });
            } catch (basicErr) {
                console.warn("Ses paylaşımı desteklenmiyor, sadece görüntü deneniyor...", basicErr);
                // Third attempt: Video only (iOS Safari usually requires this)
                screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false
                });
                alert("Cihazınız ekran sesi paylaşımını desteklemiyor (Telefon/Tablet kısıtlaması). Sadece görüntü paylaşılacaktır.");
            }
        }

        isScreenSharing = true;
        screenBtn.classList.add('active');
        
        mainVideo.srcObject = screenStream;
        waitingText.style.display = 'none';

        socket.emit('screen-share-info', { streamId: screenStream.id });

        screenStream.getTracks().forEach(track => {
            if (peerConnection) {
                const sender = peerConnection.addTrack(track, screenStream);
                screenSenders.push(sender);
            }
            
            track.onended = () => {
                stopScreenShare();
            };
        });

    } catch (err) {
        console.error('Error sharing screen', err);
    }
});

function stopScreenShare() {
    if (!isScreenSharing) return;
    
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }
    
    if (peerConnection) {
        screenSenders.forEach(sender => {
            try {
                peerConnection.removeTrack(sender);
            } catch(e) {}
        });
    }
    
    screenSenders = [];
    isScreenSharing = false;
    screenBtn.classList.remove('active');
    
    // Sadece eğer ana ekranda bizim paylaştığımız görüntü varsa ekranı temizle
    if (mainVideo.srcObject === screenStream) {
        mainVideo.srcObject = null;
        waitingText.style.display = 'flex';
    }
    
    screenStream = null;
    socket.emit('screen-share-stopped');
}

leaveBtn.addEventListener('click', () => {
    window.location.reload();
});
