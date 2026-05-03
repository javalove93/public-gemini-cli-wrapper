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
                
                // Fallback 타이머: onresult가 오지 않을 경우(아무 말 안하고 키만 쳤을 때) 대비
                // 100ms만 대기해도 충분함 (정상적인 STT는 onresult에서 이미 처리됨)
                setTimeout(() => {
                    let result = this.finalText.trim();
                    
                    if (this.pendingKeys.length > 0) {
                        result += this.pendingKeys.join('');
                        this.pendingKeys = [];
                    }

                    if (result.length > 0) {
                        if (this.onResult) this.onResult(result);
                    }
                    
                    this.finalText = '';
                    this.currentInterim = '';
                }, 100);
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
                
                if (finalTranscript) {
                    this.finalText += finalTranscript;
                    
                    // 핵심 로직: 최종 텍스트가 도착했을 때 대기 중인 키보드 입력(마침표 등)이 있다면 즉시 붙여서 전송
                    // (isRecording 상태와 무관하게, 마침표가 예약되어 있다면 무조건 전송)
                    if (this.pendingKeys.length > 0) {
                        let result = this.finalText.trim() + this.pendingKeys.join('');
                        this.pendingKeys = [];
                        if (this.onResult) this.onResult(result);
                        this.finalText = ''; // 전송 후 초기화
                    }
                }

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
