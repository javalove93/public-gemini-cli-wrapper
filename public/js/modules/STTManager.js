export class STTManager {
    constructor(onResult, onStateChange) {
        this.originalOnResult = onResult;
        this.onResult = onResult;
        this.onStateChange = onStateChange;
        this.isRecording = false;
        this.recognition = null;
        this.finalText = '';
        this.isConfirmingCancel = false;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.lang = 'ko-KR'; // Default to Korean, maybe configurable later
            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            this.recognition.onstart = () => {
                this.isRecording = true;
                this.finalText = '';
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
                if (this.finalText.trim().length > 0) {
                    if (this.onResult) this.onResult(this.finalText.trim());
                }
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

                this.finalText += finalTranscript;
                if (this.onStateChange) {
                    this.onStateChange('interim', this.finalText + interimTranscript);
                }
            };
        } else {
            console.warn('[STT] Web Speech API is not supported in this browser.');
        }
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
