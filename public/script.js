const socket = io('/');

const landingPage = document.getElementById('landing-page');
const roomPage = document.getElementById('room-page');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');

const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const mainVideo = document.getElementById('main-video');
const remoteWebcamContainer = document.getElementById('remote-webcam-container');
const ambilightVideo = document.getElementById('ambilight-video');
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

let activeStreams = [];
let remoteWebcamId = null;
let remoteScreenId = null;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

// Start Local Media
async function startLocalMedia() {
    try {
        // Kamerayı küçük ve düşük FPS'te başlat (Bant genişliğini filme sakla)
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 640, max: 854 }, 
                height: { ideal: 360, max: 480 },
                frameRate: { ideal: 24, max: 30 }
            }, 
            audio: true 
        });
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

const roomsList = document.getElementById('rooms-list');
const createBtn = document.getElementById('create-btn');

// Join Room Function
async function joinRoom(roomId) {
    currentRoom = roomId;
    await startLocalMedia();
    
    landingPage.classList.remove('active');
    roomPage.classList.add('active');

    socket.emit('join-room', currentRoom);
}

// Check URL Params
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');
if (roomParam) {
    joinRoom(roomParam);
}

// Create Room
createBtn.addEventListener('click', () => {
    const roomName = roomInput.value.trim();
    if (!roomName) {
        alert("Lütfen oluşturmak için bir oda adı girin!");
        return;
    }
    socket.emit('create-room', roomName);
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
        if (!stream) return;

        if (!activeStreams.includes(stream)) {
            activeStreams.push(stream);
            matchStreams();
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
socket.on('rooms-list', (rooms) => {
    roomsList.innerHTML = '';
    if (rooms.length === 0) {
        roomsList.innerHTML = '<li class="empty-rooms">Şu an açık oda yok. Aşağıdan bir tane oluştur!</li>';
        return;
    }

    rooms.forEach(room => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="room-info">
                <span class="room-name">${room.name}</span>
                <span class="room-size">${room.size}/2 Kişi</span>
            </div>
            <button ${room.size >= 2 ? 'disabled' : ''} onclick="joinRoom('${room.id}')">${room.size >= 2 ? 'Dolu' : 'Katıl'}</button>
        `;
        roomsList.appendChild(li);
    });
});

socket.on('room-created', (roomId) => {
    joinRoom(roomId);
    
    // Otomatik kopyala
    const inviteLink = `${window.location.origin}/?room=${roomId}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
        alert("🎉 Oda oluşturuldu!\n\nDavet linki otomatik kopyalandı. Arkadaşına gönderebilirsin veya ana sayfadaki Lobi listesinden direkt katılabilir.");
    }).catch(err => {});
});

socket.on('room-error', (msg) => {
    alert(msg);
    window.location.href = '/';
});

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
        
        if (mainVideo.srcObject && mainVideo.srcObject !== screenStream) {
            activeStreams = activeStreams.filter(s => s !== mainVideo.srcObject);
            mainVideo.srcObject = null;
            ambilightVideo.srcObject = null;
            waitingText.style.display = 'flex';
        }
        
        if (remoteVideo.srcObject) {
            activeStreams = activeStreams.filter(s => s !== remoteVideo.srcObject);
        }
        
        remoteUserId = null;
        remoteScreenId = null;
        remoteWebcamId = null;
        activeStreams = [];
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
    remoteWebcamId = id;
    matchStreams();
});

socket.on('screen-share-info', (data) => {
    remoteScreenId = data.streamId;
    matchStreams();
});

function matchStreams() {
    // 1. Önce ID'lerin tam eşleştiği yayınları yerleştir
    if (remoteScreenId && !mainVideo.srcObject) {
        const stream = activeStreams.find(s => s.id === remoteScreenId);
        if (stream) {
            mainVideo.srcObject = stream;
            ambilightVideo.srcObject = stream;
            mainVideo.muted = false;
            waitingText.style.display = 'none';
        }
    }
    
    if (remoteWebcamId && !remoteVideo.srcObject) {
        const stream = activeStreams.find(s => s.id === remoteWebcamId);
        if (stream) {
            remoteVideo.srcObject = stream;
            remoteWebcamContainer.style.display = 'block';
        }
    }

    // 2. Tarayıcı ID'yi bozduysa (Mangling), sıraya göre eşleştir
    let unmatched = activeStreams.filter(s => s !== mainVideo.srcObject && s !== remoteVideo.srcObject);
    
    // Kamera yayını hep önce gelir, o yüzden önce kamerayı doldur
    if (remoteWebcamId && !remoteVideo.srcObject && unmatched.length > 0) {
        const stream = unmatched.shift();
        remoteVideo.srcObject = stream;
        remoteWebcamContainer.style.display = 'block';
    }
    
    // Kalanı ekran paylaşımıdır
    if (remoteScreenId && !mainVideo.srcObject && unmatched.length > 0) {
        const stream = unmatched.shift();
        mainVideo.srcObject = stream;
        ambilightVideo.srcObject = stream;
        mainVideo.muted = false;
        waitingText.style.display = 'none';
    }
}

socket.on('screen-share-stopped', () => {
    if (mainVideo.srcObject && mainVideo.srcObject !== screenStream) {
        activeStreams = activeStreams.filter(s => s !== mainVideo.srcObject);
        mainVideo.srcObject = null;
        ambilightVideo.srcObject = null;
        waitingText.style.display = 'flex';
    }
    remoteScreenId = null;
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
    if (!localStream || !localStream.getAudioTracks()[0]) {
        alert("Mikrofon bulunamadı veya erişim reddedildi.");
        return;
    }
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
    if (!localStream || !localStream.getVideoTracks()[0]) {
        alert("Kamera bulunamadı veya erişim reddedildi.");
        return;
    }
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
            // First attempt: Optimal settings for movies without causing freezing
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { 
                    frameRate: { ideal: 30, max: 60 },
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 }
                },
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
        ambilightVideo.srcObject = screenStream;
        mainVideo.muted = true; // Kendi paylaştığımız sesi kendimiz duymamalıyız (Yankıyı önler)
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
        ambilightVideo.srcObject = null;
        waitingText.style.display = 'flex';
    }
    
    screenStream = null;
    socket.emit('screen-share-stopped');
}

leaveBtn.addEventListener('click', () => {
    window.location.reload();
});
