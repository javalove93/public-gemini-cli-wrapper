export class STTManager {
    constructor(onResult, onStateChange) {
        this.originalOnResult = onResult;
        this.onResult = onResult;
        this.onStateChange = onStateChange;
        this.isRecording = false;
        this.recognition = null;
        this.finalText = '';
        this.currentInterim = '';
        this.isConfirmingCancel = false;
        
        // 플러시 로직을 위한 상태
        this.pendingKeys = [];

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'ko-KR'; // Default to Korean, maybe configurable later
            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.recognition.onstart = () => {
                this.isRecording = true;
                this.finalText = '';
                this.currentInterim = '';
                this.isConfirmingCancel = false;
                this.onResult = this.originalOnResult; // Restore callback on start
                if (this.onStateChange) this.onStateChange('recording');
            };

            this.recognition.onerror = (event) => {
                console.error('[STT] Speech recognition error', event.error);
                this.isRecording = false;
                if (this.onStateChange) this.onStateChange('error', event.error);
            };

            this.recognition.onend = () => {
                this.isRecording = false;
                if (this.onStateChange) this.onStateChange('stopped');
                
                // 브라우저의 비동기 onresult 처리를 완벽히 기다리기 위해 0.3초 대기 후 전송
                setTimeout(() => {
                    if (this.finalText.trim().length > 0 || this.pendingKeys.length > 0) {
                        if (this.pendingKeys.length > 0) {
                            for (let key of this.pendingKeys) {
                                this.finalText += key;
                            }
                            this.pendingKeys = [];
                        }

                        if (this.onResult) this.onResult(this.finalText.trim());
                    }
                }, 300);
            };

            this.recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                this.currentInterim = interimTranscript;
                this.finalText += finalTranscript;
                if (this.onStateChange) {
                    this.onStateChange('interim', this.finalText + this.currentInterim);
                }
            };
        } else {
            console.warn('[STT] Web Speech API is not supported in this browser.');
        }
    }

    appendManualText(key) {
        if (!this.isRecording) return;
        
        this.pendingKeys.push(key);
        this.isConfirmingCancel = false;

        // 구두점이 입력되면 완전히 종료 (Enter 키 역할)
        this.stop();
    }

    start() {
        if (this.recognition && !this.isRecording) {
            try {
                this.recognition.start();
            } catch (e) {
                console.error('[STT] Could not start recognition', e);
            }
        }
    }

    stop() {
        if (this.recognition && this.isRecording) {
            this.recognition.stop();
        }
    }

    cancel() {
        if (this.recognition && this.isRecording) {
            if (this.isConfirmingCancel) {
                // Second press: Do actual cancel
                console.log('[STT] Confirmed cancel.');
                this.onResult = null; // Disconnect the callback to drop the text
                this.recognition.stop();
                this.isConfirmingCancel = false;
            } else {
                // First press: Enter confirmation state
                console.log('[STT] Entering cancel confirmation state.');
                this.isConfirmingCancel = true;
                if (this.onStateChange) this.onStateChange('cancelling');
            }
        }
    }

    toggle() {
        if (this.isRecording) {
            this.stop();
        } else {
            this.start();
        }
    }

    isSupported() {
        return this.recognition !== null;
    }
}
