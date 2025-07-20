/**
 * StockfishEngine
 * A JavaScript class to wrap the Stockfish chess engine Web Worker.
 * It communicates with the engine using the UCI (Universal Chess Interface) protocol
 * and provides a simple, event-driven API for use in a web application.
 * @class StockfishEngine
 */
export default class StockfishEngine {
  /**
   * Creates an instance of StockfishEngine.
   * Initializes the Web Worker and sets up event listeners.
   */
  constructor() {
    // The path to the stockfish.js worker script.
    // This path is relative to the root of your web server.
    this.worker = new Worker('./engine/stockfish.js');
    this.isReady = false;

    // --- Public Event Callbacks ---
    // These can be set by the main application to receive engine events.
    this.onReady = null;      // Fires when the engine is initialized and ready for commands.
    this.onBestMove = null;   // Fires when the engine finds the best move.
    this.onInfo = null;       // Fires with real-time thinking information from the engine.
    this.onError = null;      // Fires if the worker reports an error.

    this.setupWorkerListeners();
    this.initialize();
  }

  /**
   * Sets up the message and error listeners for the Web Worker.
   * This is where all communication from the engine is handled.
   * @private
   */
  setupWorkerListeners() {
    this.worker.onmessage = (event) => {
      const message = event.data;
      // console.log(`[ENGINE]: ${message}`); // Uncomment for deep debugging

      if (message === 'uciok') {
        // Engine acknowledges the 'uci' command. Now we can send 'isready'.
        this.worker.postMessage('isready');
      } else if (message === 'readyok') {
        // Engine is ready to receive commands.
        if (!this.isReady) {
          this.isReady = true;
          if (this.onReady) {
            this.onReady();
          }
        }
      } else if (message.startsWith('bestmove')) {
        // Engine has decided on a move.
        const move = message.split(' ')[1];
        if (this.onBestMove) {
          this.onBestMove(move);
        }
      } else if (message.startsWith('info')) {
        // Engine is providing thinking progress.
        if (this.onInfo) {
          const infoData = this.parseInfoMessage(message);
          this.onInfo(infoData); // Pass the parsed object to the callback.
        }
      }
    };

    this.worker.onerror = (error) => {
      console.error('[ENGINE ERROR]', error);
      if (this.onError) {
        this.onError(error);
      }
    };
  }
  
  /**
   * Parses a raw 'info' string from Stockfish into a structured object.
   * @private
   * @param {string} message - The raw info string from the engine.
   * @returns {object} A structured object with info like depth, score, and principal variation.
   */
  parseInfoMessage(message) {
      const infoData = {};
      const parts = message.split(' ');
      let currentKey = null;

      for (let i = 1; i < parts.length; i++) {
          const part = parts[i];
          if (['depth', 'seldepth', 'time', 'nodes', 'nps', 'hashfull', 'tbhits'].includes(part)) {
              currentKey = part;
              if (parts[i+1]) {
                  infoData[currentKey] = parseInt(parts[i + 1], 10);
                  i++; // Skip the value part
              }
          } else if (part === 'score') {
              const scoreType = parts[i+1]; // 'cp' or 'mate'
              const scoreValue = parseInt(parts[i+2], 10);
              infoData.score = {
                  type: scoreType,
                  value: scoreType === 'cp' ? scoreValue / 100.0 : scoreValue // Convert centipawns to pawns
              };
              i += 2;
          } else if (part === 'pv') {
              infoData.pv = parts.slice(i + 1).join(' ');
              break; // Principal variation is always the last part of the info string
          }
      }
      return infoData;
  }

  /**
   * Sends a command to the engine's Web Worker.
   * @private
   * @param {string} command - The UCI command string to send.
   */
  sendCommand(command) {
    this.worker.postMessage(command);
  }

  /**
   * Starts the UCI handshake to initialize the engine.
   */
  initialize() {
    this.sendCommand('uci');
  }

  /**
   * Sets the board position.
   * @param {string} fen - The position in Forsyth-Edwards Notation (FEN), or "startpos".
   */
  setPosition(fen) {
    this.sendCommand(`position ${fen}`);
  }

  /**
   * Tells the engine to start calculating on the current position by search depth.
   * @param {number} depth - The maximum depth to search to.
   */
  goDepth(depth) {
    this.sendCommand(`go depth ${depth}`);
  }

  /**
   * Tells the engine to search for a fixed amount of time.
   * @param {number} ms - milliseconds to search.
   */
  goTime(ms) {
    this.sendCommand(`go movetime ${ms}`);
  }

  /**
   * Tells the engine to stop calculating immediately.
   */
  stop() {
    this.sendCommand('stop');
  }

  /**
   * Tells the engine that the next search will be from a new game.
   * Recommended to be called before `startNewGame` in the main logic.
   */
  newGame() {
    this.sendCommand('ucinewgame');
    this.sendCommand('isready'); // Re-confirm readiness after new game setup
  }

  /**
   * Sets a UCI option in the engine.
   * @param {string} name - The name of the option (e.g., "Contempt").
   * @param {string|number} value - The value to set.
   */
  setOption(name, value) {
    this.sendCommand(`setoption name ${name} value ${value}`);
  }

  /**
   * Terminates the Web Worker to free up resources.
   */
  terminate() {
    this.worker.terminate();
  }
}
