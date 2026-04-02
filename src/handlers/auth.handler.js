const path = require('path');

/**
 * 클라이언트 인증 및 접속 상태 관리 핸들러
 */
function handleAuth(socket, io) {
    // 1. 클라이언트 정보 추출
    const headers = socket.handshake.headers;
    let rawIp = headers['x-forwarded-for'] || 
                headers['x-real-ip'] || 
                headers['cf-connecting-ip'] || 
                headers['true-client-ip'] || 
                socket.handshake.address || 
                'Unknown';
    
    let clientIp = rawIp;
    if (clientIp.includes(',')) {
        clientIp = clientIp.split(',')[0].trim();
    }
    
    const userAgent = headers['user-agent'] || 'Unknown';
    const clientType = socket.handshake.query && socket.handshake.query.type === 'viewer' ? 'Viewer' : 'Terminal';
    const clientId = (socket.handshake.query && socket.handshake.query.clientId) || 'unknown';
    const workspaceName = path.basename(process.cwd());

    // 2. 마스터 프로세스에 접속 알림 (IPC)
    if (process.send) {
        process.send({
            type: 'client_connect',
            ip: clientIp,
            clientId: clientId,
            clientType: clientType,
            userAgent: userAgent,
            workspace: workspaceName,
            socketId: socket.id,
            time: Date.now()
        });
    }

    // 3. 향후 명시적 등록(register_client) 이벤트 등을 여기서 처리 가능
    socket.on('register_client', (data) => {
        console.log(`[AUTH] Client manually registered: ${data.clientId} (${data.type})`);
        // ... 필요한 경우 추가 로직 수행
    });

    // 소켓 객체에 정보 바인딩 (다른 핸들러에서 참조 가능하게)
    socket.gcw = {
        clientId,
        clientIp,
        clientType,
        workspaceName
    };

    return socket.gcw;
}

module.exports = { handleAuth };
