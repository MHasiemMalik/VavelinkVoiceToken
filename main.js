// main.js - Final Version with Unified UID and Robust Loader

// The AgoraRTC and AgoraRTM objects will be globally available from the script tags in index.html.

// --- Configuration ---
//const APP_ID = "fa6abf69150643ac9cb3197aa0231c72"; // Paste your new App ID here
// main.js - Final Version with Volume Indicator

// The AgoraRTC and AgoraRTM objects are globally available from the script tags in index.html.

// --- Configuration ---
// main.js - Final Version with Flickering Volume Indicator

// The AgoraRTC and AgoraRTM objects are globally available from the script tags in index.html.

// --- Configuration ---
const APP_ID = "fa6abf69150643ac9cb3197aa0231c72"; // Paste your new App ID here
let rtcClient;
let rtmClient;
let channel; // RTM Channel
let localAudioTrack;

// --- DOM Elements ---
const lobbyView = document.getElementById('lobby-view');
const roomView = document.getElementById('room-view');
const lobbyForm = document.getElementById('form');
const roomNameHeader = document.getElementById('room-name');
const membersContainer = document.getElementById('members');
const micIcon = document.getElementById('mic-icon');
const leaveIcon = document.getElementById('leave-icon');

// --- State ---
let uid = String(Math.floor(Math.random() * 10000));
let roomId;
let displayName;
let micMuted = true;
let volumeTimeouts = {}; // --- NEW: Object to store timeouts for resetting glow

// --- Token Fetching ---
const fetchToken = async (endpoint, params) => {
    try {
        const response = await fetch(`http://localhost:8080/${endpoint}?${params}`);
        if (!response.ok) throw new Error(`Failed to fetch token from ${endpoint}`);
        const data = await response.json();
        return data.token;
    } catch (error) {
        console.error("Token fetch error:", error);
        return null;
    }
};

// --- Main Application Logic ---
const startApp = () => {
    const enterRoom = async (e) => {
        e.preventDefault();
        displayName = e.target.displayname.value;
        roomId = e.target.roomname.value.toLowerCase();

        // 1. Initialize RTM (for user list)
        rtmClient = AgoraRTM.createInstance(APP_ID);
        const rtmToken = await fetchToken('get-voice-rtm-token', `uid=${uid}`);
        if (!rtmToken) { alert("Failed to get RTM token."); return; }
        await rtmClient.login({ uid, token: rtmToken });

        await rtmClient.addOrUpdateLocalUserAttributes({ 'name': displayName });

        channel = rtmClient.createChannel(roomId);
        await channel.join();
        channel.on('MemberJoined', handleMemberJoined);
        channel.on('MemberLeft', handleMemberLeft);
        getChannelMembers(); // Fetch initial members

        // 2. Initialize RTC (for audio)
        rtcClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        rtcClient.on("user-published", handleUserPublished);
        rtcClient.on("user-left", handleUserLeft);
        // --- Use a shorter interval for more responsiveness ---
        AgoraRTC.setParameter('AUDIO_VOLUME_INDICATION_INTERVAL', 100); // Check volume every 100ms
        rtcClient.on("volume-indicator", handleVolumeIndicator);

        const rtcToken = await fetchToken('get-voice-rtc-token', `channelName=${roomId}&uid=${uid}`);
        if (!rtcToken) { alert("Failed to get RTC token."); return; }
        await rtcClient.join(APP_ID, roomId, rtcToken, Number(uid));

        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localAudioTrack.setMuted(micMuted);
        await rtcClient.publish([localAudioTrack]);

        // Enable the volume indicator feature
        rtcClient.enableAudioVolumeIndicator();

        // 3. Update UI
        lobbyView.style.display = 'none';
        roomView.style.display = 'block';
        document.getElementById('room-header').style.display = 'flex';
        roomNameHeader.innerText = roomId;
    };

    const handleUserPublished = async (user, mediaType) => {
        await rtcClient.subscribe(user, mediaType);
        if (mediaType === "audio") {
            user.audioTrack.play();
        }
    };

    const handleUserLeft = (user) => {
        removeMemberFromDom(String(user.uid));
    };

    // --- UPDATED: Handle Volume Indicator with Timeout for Flickering ---
    const handleVolumeIndicator = (volumes) => {
        volumes.forEach((volume) => {
            try {
                const item = document.getElementById(`member-${volume.uid}`);
                if (item) {
                    // Clear any previous timeout for this user
                    clearTimeout(volumeTimeouts[volume.uid]);

                    let boxShadow = 'none';
                    let borderColor = '#fff';

                    // Apply glow based on volume
                    if (volume.level >= 60) {
                        boxShadow = '0 0 25px #00ff00';
                        borderColor = '#00ff00';
                    } else if (volume.level >= 25) {
                        boxShadow = '0 0 15px #00ff00';
                        borderColor = '#00ff00';
                    } else if (volume.level >= 5) {
                        boxShadow = '0 0 8px #00ff00';
                        borderColor = '#00ff00';
                    }

                    // Apply the style immediately
                    item.style.boxShadow = boxShadow;
                    item.style.borderColor = borderColor;

                    // If the user is speaking (level >= 5), set a short timeout to turn off the glow
                    if (volume.level >= 5) {
                        volumeTimeouts[volume.uid] = setTimeout(() => {
                            // Only reset if the item still exists
                            const currentItem = document.getElementById(`member-${volume.uid}`);
                            if (currentItem) {
                                currentItem.style.boxShadow = 'none';
                                currentItem.style.borderColor = '#fff';
                            }
                        }, 150); // Timeout slightly longer than the interval (e.g., 150ms)
                    }
                }
            } catch (error) { console.error(`Error applying volume indicator for UID ${volume.uid}:`, error); }
        });
    };


    const handleMemberJoined = async (MemberId) => {
        addMemberToDom(MemberId);
    };

    const handleMemberLeft = async (MemberId) => {
        // Clear any lingering timeout when a member leaves
        clearTimeout(volumeTimeouts[MemberId]);
        delete volumeTimeouts[MemberId];
        removeMemberFromDom(MemberId);
    };

    const getChannelMembers = async () => {
        const members = await channel.getMembers();
        membersContainer.innerHTML = '';
        addMemberToDom(uid, displayName); // Add self
        for (const memberId of members) {
            if (memberId !== uid) {
                addMemberToDom(memberId);
            }
        }
    };

    const addMemberToDom = async (memberId, nameOverride = null) => {
        const name = nameOverride || (await rtmClient.getUserAttributesByKeys(memberId, ['name'])).name || memberId;
        
        if (document.getElementById(`member-${memberId}`)) return;

        const newMember = `
            <div class="speaker" id="member-${memberId}"> 
                <p>${name}</p>
            </div>`;
        membersContainer.insertAdjacentHTML('beforeend', newMember);
    };

    const removeMemberFromDom = (MemberId) => {
        const member = document.getElementById(`member-${MemberId}`);
        if (member) member.remove();
    };

    const toggleMic = () => {
    if (!localAudioTrack) return; // Make sure the track exists

    micMuted = !micMuted; // Toggle the state
    localAudioTrack.setMuted(micMuted); // Apply the state to the audio track

    if (micMuted) {
        // --- State: OFF ---
        micIcon.src = '/icons/mic-off.svg';
        // Set background to the gray color you had before (or choose another gray)
        micIcon.style.backgroundColor = 'rgba(102, 109, 101, 0.801)'; 
        micIcon.style.boxShadow = 'none'; // Remove any glow when off
    } else {
        // --- State: ON ---
        micIcon.src = '/icons/mic.svg';
        // Set background to the specified green-yellow color
        micIcon.style.backgroundColor = '#b3de24'; 
        // Optional: Add a subtle glow effect to match the color
        micIcon.style.boxShadow = '0 0 10px #b3de24'; 
    }

    // Clear any active volume indicator glow for self when muting/unmuting
    const selfItem = document.getElementById(`member-${uid}`);
    if (selfItem) {
        clearTimeout(volumeTimeouts[uid]);
        selfItem.style.boxShadow = 'none';
        selfItem.style.borderColor = '#fff';
    }
};

    const leaveRoom = async () => {
        if (localAudioTrack) {
            localAudioTrack.stop();
            localAudioTrack.close();
        }
        if (rtcClient) await rtcClient.leave();
        if (channel) await channel.leave();
        if (rtmClient) await rtmClient.logout();
        
        // Clear all pending timeouts
        Object.values(volumeTimeouts).forEach(clearTimeout);
        volumeTimeouts = {};

        roomView.style.display = 'none';
        lobbyView.style.display = 'block';
    };

    lobbyForm.addEventListener('submit', enterRoom);
    micIcon.addEventListener('click', toggleMic);
    leaveIcon.addEventListener('click', leaveRoom);
    window.addEventListener('beforeunload', leaveRoom);
};

const sdkReadyCheck = setInterval(() => {
    if (window.AgoraRTC && window.AgoraRTM) {
        clearInterval(sdkReadyCheck);
        console.log("Agora SDKs are ready. Starting application.");
        startApp();
    } else {
        console.log("Waiting for Agora SDKs to load...");
    }
}, 100);