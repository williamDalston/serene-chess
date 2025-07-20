// engineController.js
export default class StockfishEngine {
  constructor() {
    this.worker = new Worker('/engine/stockfish.js');
    this.isReady = false;
    
    // Event callbacks
    this.onReady = null;
    this.onBestMove = null;
    this.onInfo = null;
    this.onError = null;
    
    this.setupWorker();
    this.initialize();
  }
  
  setupWorker() {
    this.worker.onmessage = (event) => {
      const message = event.data;
      console.log('[ENGINE]', message);
      
      if (message === 'uciok') {
        this.worker.postMessage('isready');
      } else if (message === 'readyok') {
        if (!this.isReady) {
          this.isReady = true;
          if (this.onReady) this.onReady();
        }
      } else if (message.startsWith('bestmove')) {
        const move = message.split(' ')[1];
        if (this.onBestMove) this.onBestMove(move);
      } else if (message.startsWith('info')) {
        if (this.onInfo) this.onInfo(message);
      }
    };
    
    this.worker.onerror = (error) => {
      console.error('Engine error:', error);
      if (this.onError) this.onError(error);
    };
  }
  
  initialize() {
    this.worker.postMessage('uci');
  }
  
  setPosition(position, moves = []) {
    if (moves.length > 0) {
      this.worker.postMessage(`position ${position} moves ${moves.join(' ')}`);
    } else {
      this.worker.postMessage(`position ${position}`);
    }
  }
  
  goDepth(depth) {
    this.worker.postMessage(`go depth ${depth}`);
  }
  
  goTime(timeMs) {
    this.worker.postMessage(`go movetime ${timeMs}`);
  }
  
  goInfinite() {
    this.worker.postMessage('go infinite');
  }
  
  stop() {
    this.worker.postMessage('stop');
  }
  
  newGame() {
    this.worker.postMessage('ucinewgame');
    this.worker.postMessage('isready');
  }
  
  setOption(name, value) {
    this.worker.postMessage(`setoption name ${name} value ${value}`);
  }
  
  // Utility methods for common positions
  setStartPosition() {
    this.setPosition('startpos');
  }
  
  setFenPosition(fen) {
    this.setPosition(`fen ${fen}`);
  }
  
  // Clean up resources
  terminate() {
    this.worker.terminate();
  }
  
  // Check if engine is ready
  get ready() {
    return this.isReady;
  }
}