// --- Imports: Always at the Top ---
import StockfishEngine from './engineController.js';
import { Chess } from 'chess.js';
import * as Tone from 'tone';


console.log('main.js loaded');
window.SereneChessLoaded = true;

document.addEventListener('DOMContentLoaded', () => {
    // --- SVG Piece Mapping ---

    const SVG_PIECES = {
  p: '/pieces/bP.svg',
  r: '/pieces/bR.svg',
  n: '/pieces/bN.svg',
  b: '/pieces/bB.svg',
  q: '/pieces/bQ.svg',
  k: '/pieces/bK.svg',
  P: '/pieces/wP.svg',
  R: '/pieces/wR.svg',
  N: '/pieces/wN.svg',
  B: '/pieces/wB.svg',
  Q: '/pieces/wQ.svg',
  K: '/pieces/wK.svg'
};

    const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };

    // --- Engine Preset Configurations ---
    const PRESETS = {
        defender: { contempt: -50, name: "Defender: Cautious and solid." },
        balanced: { contempt: 0, name: "Balanced: A neutral, well-rounded style." },
        aggressor: { contempt: 50, name: "Aggressor: Prefers attacking and complications." }
    };

    // --- Game State ---
    const game = new Chess();
    let boardOrientation = 'white';
    let playerColor = 'w';
    let lastMove = null;
    let engineElo = 1800;
    let engineContempt = 0;
    let humanMode = false;
    let soundEnabled = false;
    let trainingMode = false;
    let forceMoveTimeout;
    let selectedSquare = null;
    let isAudioReady = false;
    let isMobile = window.innerWidth <= 768;
    let resizeTimeout;
    let dragDebounceTimeout;
    const MOBILE_BREAKPOINT = 768;
    let draggedPieceEl = null;

    // --- DOM Elements ---
    const boardEl = document.getElementById('chessboard');
    const historyEl = document.getElementById('move-history');
    const moveHistoryToggleEl = document.getElementById('move-history-toggle');
    const evaluationDisplay = document.querySelector('.evaluation-display');
    const evaluationBar = document.getElementById('evaluation-bar');
    const mateInLabel = document.getElementById('mate-in-label');
    const newGameBtn = document.getElementById('new-game');
    const undoBtn = document.getElementById('undo-move');
    const flipSwitchBtn = document.getElementById('flip-switch-button');
    const forceMoveBtn = document.getElementById('force-move');
    const promotionOverlay = document.getElementById('promotion-overlay');
    const promotionDialog = promotionOverlay ? promotionOverlay.querySelector('.promotion-dialog') : null;
    const eloSlider = document.getElementById('elo-slider');
    const eloLabelCurrent = document.getElementById('elo-label-current');
    const presetButtons = document.querySelectorAll('[data-preset]');
    const whiteCapturedEl = document.getElementById('white-captured');
    const blackCapturedEl = document.getElementById('black-captured');
    const gameOverOverlay = document.getElementById('game-over-overlay');
    const gameOverTitle = document.getElementById('game-over-title');
    const gameOverMessage = document.getElementById('game-over-message');
    const gameOverNewGameBtn = document.getElementById('game-over-new-game');
    const settingsIcon = document.getElementById('settings-icon');
    const settingsModal = document.getElementById('settings-modal');
    const resetSettingsBtn = document.getElementById('reset-settings');
    const humanModeToggle = document.getElementById('human-mode-toggle');
    const trainingModeToggle = document.getElementById('training-mode-toggle');
    const soundToggle = document.getElementById('sound-toggle');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const engineControls = document.querySelectorAll('.panel-section:not(:last-child)');
    const connectionIndicatorEl = document.getElementById('engine-indicator'); 
    const connectionStatusTextEl = document.getElementById('engine-status');
    const thinkingIndicator = document.getElementById('thinking-indicator');
    const SETTINGS_VERSION = 2; // Start with 1, increment to 2 for this change, then 3, etc.

    // Defensive checks
    if (!boardEl || !historyEl || !evaluationDisplay || !evaluationBar || !mateInLabel) {
        console.error('Critical UI elements not found in DOM');
        return;
    }

// --- INITIAL BOARD AND LAYOUT RENDERING ---
    // Render the board as soon as the DOM is ready
    renderBoard(game.fen(), boardOrientation); // Renders the board with default state initially
    updateLayoutForDevice(); // Adjusts layout for mobile/desktop
    updateCapturedPieces(); // Ensure captured pieces display is clear on initial load

    // loadSettings(); // Load saved preferences BEFORE setting engine status

    // Set initial engine status (will be overwritten by engine.onReady)
    connectionStatusTextEl.textContent = 'Loading Engine...';
    connectionIndicatorEl.style.backgroundColor = 'var(--warning)';
    // --- END INITIAL RENDERING ---

    // --- Sound Synthesis ---
    
    // --- Engine Setup ---
    const engine = new StockfishEngine();

    // --- Engine Callbacks ---
    engine.onReady = () => {
        engine.setOption('UCI_LimitStrength', true);
        loadSettings(); // Load saved settings (including ELO and contempt) AFTER engine is ready.
        connectionStatusTextEl.textContent = 'Ready'; // Engine is ready
        connectionIndicatorEl.style.backgroundColor = 'var(--success)'; // Green for ready

        if (game.turn() !== playerColor && !humanMode && !game.isGameOver()) {
            requestEngineMove(true);
        }
    };
    engine.onInfo = (info) => { if (info.score) updateEvaluationBar(info.score, game.turn()); };
    engine.onBestMove = (moveStr) => {
      const move = game.move(moveStr, { sloppy: true });
      if (move) {
        playSound(move);
        lastMove = move;
      }
      hideThinking();
      renderBoard(game.fen(), boardOrientation);
      updateHistory();
      updateCapturedPieces();
      checkGameOver();
      updateTurnIndicator();
    };
    engine.onError = (err) => console.error('[ENGINE ERROR]', err);


function playSound(move) {
    // Only attempt to play sound if sound is enabled and _playMoveSound function has been initialized
    if (soundEnabled && typeof window._playMoveSound === 'function') {
        window._playMoveSound(move);
    }
}
    // --- END Sound Synthesis ---

    // --- Responsive Layout Handler ---
    function handleResize() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const wasMobile = isMobile;
            isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
            if (wasMobile !== isMobile) {
                requestAnimationFrame(() => {
                    updateLayoutForDevice();
                    renderBoard(game.fen(), boardOrientation);
                });
            }
        }, 150);
    }

function updateLayoutForDevice() {
    if (isMobile) {
        // historyEl.style.display = 'none'; // OLD: Replaced by collapsible-content .collapsed
        moveHistoryToggleEl.classList.add('collapsed'); // Make title look collapsed
        historyEl.classList.add('collapsed'); // Hide content
        historyEl.style.maxHeight = '0'; // Ensure max-height for smooth transition
    } else {
        // historyEl.style.display = 'block'; // OLD: Replaced by collapsible-content .collapsed
        moveHistoryToggleEl.classList.remove('collapsed'); // Ensure title looks open
        historyEl.classList.remove('collapsed'); // Show content
        historyEl.style.maxHeight = '250px'; // Ensure max-height for smooth transition
    }
    evaluationDisplay.style.position = isMobile ? 'relative' : 'absolute';
    evaluationDisplay.style.order = isMobile ? '-1' : 'initial';
    updateTurnIndicator();
}

    function updateTurnIndicator() {
        const whiteSideEl = document.getElementById('white-captured');
        const blackSideEl = document.getElementById('black-captured');

        // Remove existing turn indicators
        whiteSideEl.classList.remove('current-turn');
        blackSideEl.classList.remove('current-turn');

        // Add indicator to the current player's side
        if (game.turn() === 'w') {
            if (boardOrientation === 'white') {
                whiteSideEl.classList.add('current-turn');
            } else { // boardOrientation is black, so black side is at the top
                blackSideEl.classList.add('current-turn');
            }
        } else { // game.turn() === 'b'
            if (boardOrientation === 'white') {
                blackSideEl.classList.add('current-turn');
            } else { // boardOrientation is black, so white side is at the bottom
                whiteSideEl.classList.add('current-turn');
            }
        }
    }

    function updateFlipSwitchButtonText() {
        flipSwitchBtn.textContent = `Play as ${playerColor === 'w' ? 'Black' : 'White'}`;
    }

    window.addEventListener('resize', handleResize);

    // Toggle move history visibility on mobile
if (moveHistoryToggleEl) {
    moveHistoryToggleEl.addEventListener('click', () => {
        // Only allow toggling if in mobile mode
        if (isMobile) {
            const isCollapsed = moveHistoryToggleEl.classList.toggle('collapsed');
            historyEl.classList.toggle('collapsed', isCollapsed);
            // Dynamically set max-height for smooth transition
            historyEl.style.maxHeight = isCollapsed ? '0' : historyEl.scrollHeight + 'px';
        }
    });
}

    // --- Game & UI Logic ---
   // --- Game & UI Logic ---
function startNewGame() {
        game.reset(); // Reset the chess.js game board
        lastMove = null; // Clear last move highlighting
        engine.stop(); // Stop any ongoing engine calculations
        engine.newGame(); // Tell the engine to start a new game from scratch
        gameOverOverlay.style.display = 'none'; // Hide any game over messages
        updateHistory(); // Clear move history display
        updateCapturedPieces(); // Clear captured pieces display
        updateFlipSwitchButtonText(); // Ensure the "Play as" button text is correct based on playerColor
        updateEvaluationBar({ type: 'cp', value: 0 }); // Reset evaluation bar to neutral
        
        // --- NEW: Initiate the game flow ---
        startGameFlow(); // This is the ONLY call that should manage board rendering and next move logic
    }

function requestEngineMove(isFast = false) {
        if (game.isGameOver() || humanMode) return;
        showThinking();
        engine.setPosition('fen ' + game.fen());

        // --- NEW moveTime CALCULATION ---
        // For the very first move (isFast = true), keep it at 500ms
        // For subsequent moves, scale based on ELO but cap at 1.5 seconds (1500ms)
        const baseTime = 500; // Minimum time for very weak engine
        const maxTime = 1500; // Maximum time for strongest engine (1.5 seconds)
        const eloScalingFactor = 0.5; // Controls how much time increases with ELO

        const moveTime = isFast 
            ? 500 
            : Math.min(maxTime, baseTime + (engineElo - 1200) * eloScalingFactor);
        // --- END NEW moveTime CALCULATION ---
        
        engine.goTime(moveTime);

        clearTimeout(forceMoveTimeout);
        // Set the timeout slightly longer than the requested moveTime to allow for execution
        forceMoveTimeout = setTimeout(() => {
            if (thinkingIndicator && thinkingIndicator.classList.contains('visible')) {
                engine.stop(); // Force stop if it exceeds its allotted time + buffer
                console.warn('Engine exceeded expected move time. Forcing stop.');
            }
        }, moveTime + 200); // Give it a 200ms grace period after the requested movetime
    }

    // --- Game Start/Continuation Flow ---
    function startGameFlow() {
        renderBoard(game.fen(), boardOrientation); // Explicitly pass current FEN and boardOrientation

        // Ensure status indicators are reset or updated based on the current state
        hideThinking(); // Clear any 'thinking' state (important if an undo or new game happened)
        if (!game.isGameOver() && !trainingMode) { // Only set to 'Ready' if game is ongoing and not in training mode
            connectionStatusTextEl.textContent = 'Ready';
            // connectionIndicatorEl.style.backgroundColor should already be success from engine.onReady
        }
        
        // Request engine move if it's the engine's turn and not human mode or game over
        if (game.turn() !== playerColor && !humanMode && !game.isGameOver()) {
            requestEngineMove(true); // 'true' signals this is an immediate/fast first move of engine's turn
        }
        
        // Update button states based on the new game state
        // Undo button enabled if there's history, disabled if not (or only 1 move if humanMode)
        undoBtn.disabled = humanMode ? game.history().length < 1 : game.history().length < 2;
        // Force Move button enabled only if it's the engine's turn AND not human mode AND game not over

        updateTurnIndicator(); // Visually indicate whose turn it is
    }

    function checkGameOver() {
        if (!game.isGameOver() || trainingMode) {
            if (connectionStatusTextEl && thinkingIndicator && !thinkingIndicator.classList.contains('visible')) {
                connectionStatusTextEl.textContent = 'Ready';
            }
            return false;
        }
        let title = "Game Over";
        let message = "";
        if (game.isCheckmate()) {
            title = "Checkmate!";
            message = `${game.turn() === 'w' ? 'Black' : 'White'} wins.`;
            updateEvaluationBar({ type: 'mate', value: game.turn() === 'w' ? -1 : 1 });
        } else {
            title = "Draw";
            message = "The game is a draw.";
            updateEvaluationBar({ type: 'cp', value: 0 });
        }
        gameOverTitle.textContent = title;
        gameOverMessage.textContent = message;
        gameOverOverlay.style.display = 'flex';
        return true;
    }

// --- Board Rendering ---
// Modified to accept an explicit desiredOrientation for immediate flips
function renderBoard(fen = game.fen(), desiredOrientation = boardOrientation) { // Add desiredOrientation parameter
    // Before rendering, clear all existing drag-over classes to prevent stickiness
    document.querySelectorAll('.square.drag-over').forEach(sq => sq.classList.remove('drag-over'));
    
    const tempGame = new Chess(fen); // Create a temporary game for rendering the specific FEN
    boardEl.innerHTML = ''; // Clear the current board display

    // Determine ranks and files based on the desiredOrientation
    const ranks = desiredOrientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
    const files = desiredOrientation === 'white' ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];

    let checkedKingSquare = null;
    // Check if the current player's king is in check to highlight the square
    if (tempGame.inCheck() && tempGame.findKing) {
        const kingPos = tempGame.findKing(tempGame.turn());
        if (kingPos) checkedKingSquare = kingPos.square;
    }

    // Loop through ranks and files to create squares and place pieces
    for (const rank of ranks) {
        for (const file of files) {
            const squareName = file + rank; // e.g., 'a1', 'h8'
            const piece = tempGame.get(squareName); // Get piece at this square from the temp game
            const squareEl = document.createElement('div');
            
            // Add appropriate classes for light/dark squares and basic styling
            squareEl.classList.add('square', (files.indexOf(file) + ranks.indexOf(rank)) % 2 === 0 ? 'light' : 'dark');
            squareEl.dataset.square = squareName; // Store square name for easy lookup

            // Add classes for last move, check, selected, and possible moves
            if (lastMove && (squareName === lastMove.from || squareName === lastMove.to)) squareEl.classList.add('last-move');
            if (squareName === checkedKingSquare) squareEl.classList.add('in-check');
            if (selectedSquare === squareName) squareEl.classList.add('selected');

            // --- Highlight Legal Moves (if enabled) ---
            // This part assumes you have highlightMovesToggle and it's checked
            const highlightMovesEnabled = document.getElementById('highlight-moves-toggle')?.checked;
            if (highlightMovesEnabled && selectedSquare === squareName) {
                // If a piece is selected and highlights are enabled, show possible moves from this square
                const possibleMoves = tempGame.moves({ square: selectedSquare, verbose: true });
                possibleMoves.forEach(move => {
                    const targetSquareEl = document.querySelector(`[data-square="${move.to}"]`);
                    if (targetSquareEl) {
                        targetSquareEl.classList.add('possible-move');
                    }
                });
            }
            // --- End Highlight Legal Moves ---
            
            // Add event listeners for mouse drag/drop and touch
            squareEl.addEventListener('dragover', handleDragOver);
            squareEl.addEventListener('drop', handleDrop);
            squareEl.addEventListener('dragleave', (e) => e.currentTarget.classList.remove('drag-over'));
            squareEl.addEventListener('click', () => onSquareClick(squareName));

            // If there's a piece on this square, create and append its image
            if (piece) {
                const pieceKey = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
                const pieceImg = document.createElement('img');
                pieceImg.src = SVG_PIECES[pieceKey];
                pieceImg.classList.add('chess-piece');
                
                // Make pieces draggable only for the current human player or in human vs human mode
                if ((piece.color === playerColor && !humanMode) || (humanMode && piece.color === tempGame.turn())) {
                    pieceImg.draggable = true; // Enable native drag for mouse
                    pieceImg.addEventListener('dragstart', handleDragStart);
                    pieceImg.addEventListener('dragend', handleDragEnd);
                    // Add touch listeners for mobile drag
                    pieceImg.addEventListener('touchstart', handleTouchStart, { passive: false });
                    pieceImg.addEventListener('touchmove', handleTouchMove, { passive: false });
                    pieceImg.addEventListener('touchend', handleTouchEnd, { passive: false });
                }
                squareEl.appendChild(pieceImg);
            }
            boardEl.appendChild(squareEl); // Add the square to the chessboard
        }
    }
    // Ensure promotion overlay is within the board element (for absolute positioning relative to board)
    if (promotionOverlay && !boardEl.contains(promotionOverlay)) boardEl.appendChild(promotionOverlay);
    updateTurnIndicator(); // Update the visual indicator of whose turn it is
}

    // --- Drag, Drop, and Touch Handlers ---


    function handleDragStart(e) {
        if ((game.turn() !== playerColor && !humanMode)) { e.preventDefault(); return; }
        selectedSquare = e.target.parentElement.dataset.square;
        draggedPieceEl = e.target;
        e.dataTransfer.setData('text/plain', selectedSquare);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => { draggedPieceEl.classList.add('dragging'); }, 0);
    }
    function handleDragEnd(e) { if (draggedPieceEl) { draggedPieceEl.classList.remove('dragging'); } draggedPieceEl = null; selectedSquare = null; }
    function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('drag-over'); }
    function handleDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        if (selectedSquare && toSquare && selectedSquare !== toSquare) {
                    attemptMove(selectedSquare, toSquare);
                } else {
                    renderBoard(game.fen(), boardOrientation); // Pass boardOrientation explicitly
                }
    }
    function handleTouchStart(e) {
        e.preventDefault();
        if ((game.turn() !== playerColor && !humanMode)) return;
        
        clearTimeout(dragDebounceTimeout);
        dragDebounceTimeout = setTimeout(() => {
selectedSquare = e.target.parentElement.dataset.square;
    
    // --- NEW: Clone the piece for dragging ---
    const originalPieceEl = e.target;
    const originalSquareRect = originalPieceEl.parentElement.getBoundingClientRect();
    
    draggedPieceEl = originalPieceEl.cloneNode(true); // Clone the piece!
    
    // Set styles for the cloned dragging piece
    Object.assign(draggedPieceEl.style, {
        position: 'absolute',
        zIndex: '1000',
        pointerEvents: 'none', // Don't block events below it
        width: `${originalPieceEl.offsetWidth}px`, // Match original's rendered width
        height: `${originalPieceEl.offsetHeight}px`, // Match original's rendered height
        // Start the cloned piece exactly where the original was
        left: `${originalSquareRect.left + originalPieceEl.offsetLeft}px`,
        top: `${originalSquareRect.top + originalPieceEl.offsetTop}px`,
        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))', // Add a stronger shadow for "lifting" effect
        transition: 'none', // Prevent transition effects from original
        cursor: 'grabbing' // Indicate grabbing
    });

    document.body.appendChild(draggedPieceEl); // Append the CLONED piece to body
    originalPieceEl.style.opacity = '0.3'; // Make original piece semi-transparent
    originalPieceEl.style.cursor = 'grabbing'; // Change original cursor
    // --- END NEW ---

    handleTouchMove(e); // Initial positioning
        }, 50);
    }
    function handleTouchMove(e) {
        if (!draggedPieceEl) return;
        requestAnimationFrame(() => {
            const touch = e.touches[0];
            draggedPieceEl.style.left = `${touch.pageX - draggedPieceEl.offsetWidth / 2}px`;
            draggedPieceEl.style.top = `${touch.pageY - draggedPieceEl.offsetHeight / 2}px`;
        });
    }
    function handleTouchEnd(e) {
        clearTimeout(dragDebounceTimeout);
if (!draggedPieceEl) return;
    
    const touch = e.changedTouches[0];
    const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
    const toSquare = dropTarget?.classList.contains('square') ? 
        dropTarget.dataset.square : 
        dropTarget?.parentElement?.dataset.square;
    
    // Before attempting move, get the original piece element back to normal
    const originalPieceEl = document.querySelector(`[data-square="${selectedSquare}"] .chess-piece`);
    if (originalPieceEl) {
        originalPieceEl.style.opacity = '1'; // Make original piece visible again
        originalPieceEl.style.cursor = 'grab'; // Reset cursor
    }

    // Remove the cloned dragged piece from the DOM
    if (document.body.contains(draggedPieceEl)) {
         document.body.removeChild(draggedPieceEl);
    }
    draggedPieceEl = null; // Clear the reference

    if (selectedSquare && toSquare && selectedSquare !== toSquare) {
        attemptMove(selectedSquare, toSquare);
    } else {
        // If no valid move, or piece dropped back on same square
        selectedSquare = null; // Clear selected square
        renderBoard(game.fen(), boardOrientation); // Re-render to ensure board state is correct
    }
    // No need to remove event listeners from draggedPieceEl here as it's a clone and about to be removed.
    // The original piece's listeners remain.
    }

    // --- Move Execution and Animation ---
    async function onSquareClick(square) {
        if (selectedSquare) {
            await attemptMove(selectedSquare, square);
            selectedSquare = null;
            renderBoard(game.fen(), boardOrientation); // Pass boardOrientation explicitly
        } else {
            const piece = game.get(square);
            if (piece && ((piece.color === playerColor && !humanMode) || (humanMode && piece.color === game.turn()))) {
                selectedSquare = square;
                renderBoard(game.fen(), boardOrientation);
            }
        }
    }

    async function attemptMove(from, to) {
        const legalMove = game.moves({ square: from, verbose: true }).find(m => m.to === to);
        if (!legalMove) { renderBoard(game.fen(), boardOrientation); return; }

        const moveData = { from, to };
        if (legalMove.flags.includes('p')) {
            try { moveData.promotion = await promptForPromotion(playerColor); } 
            catch { renderBoard(game.fen(), boardOrientation); return; }
        }
        animateAndFinalizeMove(moveData);
    }

    function animateAndFinalizeMove(move) {
        const fromEl = document.querySelector(`[data-square=${move.from}]`);
        const toEl = document.querySelector(`[data-square=${move.to}]`);
        const pieceEl = fromEl.querySelector('.chess-piece');
        
        if (!fromEl || !toEl || !pieceEl) {
            const result = game.move(move);
            if (result) lastMove = result;
            renderBoard(game.fen(), boardOrientation);
            return;
        }

const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const flyingPiece = pieceEl.cloneNode(true); // Keep this line
        
        Object.assign(flyingPiece.style, {
            position: 'absolute',
            left: `${fromRect.left}px`,
            top: `${fromRect.top}px`,
            zIndex: '1000',
            pointerEvents: 'none',
            width: `${pieceEl.offsetWidth}px`, // Use original piece's current rendered size
            height: `${pieceEl.offsetHeight}px`,// Use original piece's current rendered size
            willChange: 'transform'
        });
        
        document.body.appendChild(flyingPiece);
        
        // Temporarily hide the original piece on the board *before* the game.move()
        // This prevents the piece from appearing in two places briefly.
        if (pieceEl) { // Added defensive check
            pieceEl.style.visibility = 'hidden'; // Changed from opacity to visibility
        }
        const result = game.move(move);
        if (result) {
            playSound(result);
            lastMove = result;
        }
        
        requestAnimationFrame(() => {
            renderBoard(game.fen(), boardOrientation);
            
            const newToEl = document.querySelector(`[data-square=${move.to}]`);
            const newPieceEl = newToEl?.querySelector('.chess-piece');
            if (newPieceEl) newPieceEl.style.visibility = 'hidden';

            const dx = toRect.left - fromRect.left;
            const dy = toRect.top - fromRect.top;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const duration = isMobile ? 
                Math.min(Math.max(distance * 0.4, 100), 250) : 
                Math.min(Math.max(distance * 0.6, 120), 350);

            flyingPiece.animate([
                { transform: 'translate(0, 0)' },
                { transform: `translate(${dx}px, ${dy}px)` }
            ], { 
                duration, 
                easing: 'cubic-bezier(0.2, 1, 0.3, 1)',
                fill: 'forwards'
            }).onfinish = () => {
                flyingPiece.style.willChange = 'auto';
                document.body.removeChild(flyingPiece);
                if (newPieceEl) newPieceEl.style.visibility = 'visible';
                
                updateHistory();
                updateCapturedPieces();
// After the animation and move, check for game over.
                // If not game over, proceed with the standard game flow (which includes requesting engine move if needed).
                if (!checkGameOver()) {
                    startGameFlow(); // Let startGameFlow handle the next turn (human or engine)
                }
            };
        });
    }

    function promptForPromotion(color) {
        if (!promotionOverlay || !promotionDialog) return;
        promotionOverlay.style.display = 'flex';
        promotionDialog.innerHTML = '';
        
        const pieces = [
            { type: 'q', name: 'Queen' },
            { type: 'r', name: 'Rook' }, 
            { type: 'b', name: 'Bishop' },
            { type: 'n', name: 'Knight' }
        ];
        
        pieces.forEach((piece, index) => {
            const pieceKey = color === 'w' ? piece.type.toUpperCase() : piece.type;
            const img = document.createElement('img');
            img.src = SVG_PIECES[pieceKey];
            img.classList.add('promotion-piece');
            img.dataset.piece = piece.type;
            img.setAttribute('aria-label', `Promote to ${piece.name}`);
            img.setAttribute('tabindex', '0');
            img.setAttribute('role', 'button');
            
            img.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    img.click();
                }
            });
            
            promotionDialog.appendChild(img);
            if (index === 0) setTimeout(() => img.focus(), 0); // Safe focus
        });
        
        return new Promise((resolve) => {
            const handler = (e) => {
                if (e.target.classList.contains('promotion-piece')) {
                    promotionOverlay.style.display = 'none';
                    promotionDialog.removeEventListener('click', handler);
                    resolve(e.target.dataset.piece);
                }
            };
            promotionDialog.addEventListener('click', handler);
        });
    }

    // --- Event Listeners & Helpers ---
    newGameBtn.addEventListener('click', startNewGame);
    gameOverNewGameBtn.addEventListener('click', startNewGame);
flipSwitchBtn.addEventListener('click', () => {
        if(thinkingIndicator && thinkingIndicator.classList.contains('visible')) return; 

        playerColor = (playerColor === 'w') ? 'b' : 'w';
        boardOrientation = (playerColor === 'w') ? 'white' : 'black'; // Update the global variable

        updateFlipSwitchButtonText(); // Update the button text

        // --- NEW: Immediately render the board with the new orientation ---
        // This should force the visual flip without delay, as it's a direct DOM manipulation.
        renderBoard(game.fen(), boardOrientation); // Pass the current game FEN and the NEW boardOrientation

        // --- Now, use setTimeout to initiate the rest of the game flow ---
        // This allows the browser a moment to paint the flip before the engine starts thinking.
        setTimeout(() => {
            startGameFlow(); 
        }, 0); 
    });
   undoBtn.addEventListener('click', () => { 
        if (humanMode) {
            if (game.history().length < 1) return; // Cannot undo if no moves
            game.undo(); // Undo one move in human mode
            lastMove = game.history({ verbose: true }).pop() || null; // Update last move for highlighting
            playerColor = playerColor === 'w' ? 'b' : 'w'; // Flip player color back to reflect whose turn it is now
        } else {
            if (game.history().length < 2) return; // Cannot undo if less than 2 engine+human moves
            engine.stop(); // Stop engine calculation
            game.undo(); // Undo human move
            game.undo(); // Undo engine move
            lastMove = game.history({ verbose: true }).pop() || null; // Update last move for highlighting
            engine.setPosition('fen ' + game.fen()); // Inform engine of new position after undo
        }
        
        // --- NEW: Unified flow after undo ---
        startGameFlow(); // This will re-render the board, update indicators, and request engine move if applicable
    });
    
    
   forceMoveBtn.addEventListener('click', () => { 
        // If it's the engine's turn and not human mode, force it to move.
        // This stops current calculations and makes it play the best move found so far.
        if (game.turn() !== playerColor && !humanMode && !game.isGameOver()) {
            engine.stop(); // This command usually makes Stockfish output its bestmove immediately
            // Note: engine.stop() also triggers engine.onBestMove, which will call startGameFlow() indirectly.
        }
        // Force button should disable itself as soon as the engine starts thinking again or it's no longer engine's turn
        forceMoveBtn.disabled = true;
    });

    function applyPreset(presetName) {
        const preset = PRESETS[presetName];
        if (!preset) return;

        presetButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.preset === presetName));
        
        engineContempt = preset.contempt;
        engine.setOption('Contempt', engineContempt);

// --- NEW: Trigger game flow after preset change if it's engine's turn ---
    // This ensures the engine reacts with its new preset immediately if it's its turn.
    if (!checkGameOver()) { // Only do this if game is not over
         startGameFlow();
    }
    }

    function updateElo(elo) {
        engineElo = elo;
        eloSlider.value = elo;
        updateEloLabel(elo);
        engine.setOption('UCI_Elo', elo);
    }

    function updateEloLabel(elo) {
        let label = '';
        if (elo < 1600) label = 'Beginner';
        else if (elo < 2400) label = 'Expert';
        else label = 'Grandmaster';

        eloLabelCurrent.textContent = label;
    }

    eloSlider.addEventListener('input', (e) => {
        const elo = parseInt(e.target.value, 10);
        engineElo = elo;
        updateEloLabel(elo);
        engine.setOption('UCI_Elo', elo);
    });
    eloSlider.addEventListener('change', () => { if (!checkGameOver()) { // Only trigger if game isn't over
        startGameFlow(); // Re-evaluate game flow (which might trigger engine move if it's its turn)
    }
    saveSettings(); });// Don't forget to save settings on change });

    humanModeToggle.addEventListener('change', (e) => {
        humanMode = e.target.checked;
        engineControls.forEach(control => control.style.opacity = humanMode ? '0.5' : '1');
        engineControls.forEach(control => control.style.pointerEvents = humanMode ? 'none' : 'auto');
        renderBoard(game.fen(), boardOrientation);
        saveSettings(); // Add this line
    });
    // Add event listeners for auto-queen and highlight moves toggles here
    const autoQueenToggle = document.getElementById('auto-queen-toggle');
    if (autoQueenToggle) { // Defensive check in case element isn't found
        autoQueenToggle.addEventListener('change', saveSettings);
    }
    const highlightMovesToggle = document.getElementById('highlight-moves-toggle');
    if (highlightMovesToggle) { // Defensive check
        highlightMovesToggle.addEventListener('change', saveSettings);
    }

    // New: Reset Settings button functionality
    if (resetSettingsBtn) { // Defensive check
        resetSettingsBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset all settings to default?')) {
                localStorage.removeItem('sereneChessSettings'); // Clear all saved settings for your app
                location.reload(); // Reload the page to apply fresh defaults
            }
        });
    }

    soundToggle.addEventListener('change', (e) => { 
        soundEnabled = e.target.checked; 
        saveSettings(); // Add this line
    });
    darkModeToggle.addEventListener('change', (e) => { 
        document.body.classList.toggle('dark-mode', e.target.checked); 
        saveSettings(); // Add this line
    });
    trainingModeToggle.addEventListener('change', (e) => { 
        trainingMode = e.target.checked; 
        saveSettings(); // Add this line
    });

    settingsIcon.addEventListener('click', () => {
        settingsModal.style.display = settingsModal.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', (e) => {
        if (!settingsModal.contains(e.target) && e.target !== settingsIcon) {
            settingsModal.style.display = 'none';
        }
    });

function updateHistory() {
        if (isMobile && !trainingMode) return; // Skip history updates on mobile unless in training mode
        
        historyEl.innerHTML = '';

        // If the panel is currently open on mobile and content changes, adjust max-height
        if (isMobile && !historyEl.classList.contains('collapsed')) {
            historyEl.style.maxHeight = historyEl.scrollHeight + 'px';
        }
        const history = game.history({ verbose: true }); // Get verbose history
        
        if (history.length === 0) {
            historyEl.innerHTML = `<div style="text-align: center; color: var(--text-tertiary); padding: var(--space-lg) 0; font-style: italic;">Game moves will appear here</div>`;
            undoBtn.disabled = true;
            return;
        }
        
        const fragment = document.createDocumentFragment();
        let movePairEl = null; // To hold the current move pair div
        
        history.forEach((move, index) => {
            const moveNumber = Math.floor(index / 2) + 1; // 1-based move number
            const isWhitesMove = index % 2 === 0; // True if it's White's move (0, 2, 4...)

            if (isWhitesMove) {
                // If it's White's move, create a new move pair container
                movePairEl = document.createElement('div');
                movePairEl.classList.add('move-pair');
                movePairEl.innerHTML = `<div class="move-number">${moveNumber}.</div>`;
                
                const whiteMoveSpan = document.createElement('span');
                whiteMoveSpan.classList.add('move');
                whiteMoveSpan.textContent = move.san;
                movePairEl.appendChild(whiteMoveSpan);
                
                // Add a placeholder for black's move
                const blackMoveSpan = document.createElement('span');
                blackMoveSpan.classList.add('move');
                // Don't set textContent yet, it will be added on the next iteration or left empty
                movePairEl.appendChild(blackMoveSpan);
                
                fragment.appendChild(movePairEl);
            } else {
                // If it's Black's move, append it to the last move pair
                if (movePairEl) { // Ensure movePairEl exists (it should if logic is followed)
                    movePairEl.children[2].textContent = move.san; // Update the third child (black's move span)
                }
            }
            
            // Add click listener to the move pair for navigating history
            // We need to capture the state at this point for the click handler
            const currentMoveIndex = index; // Closure over the current index
            if (movePairEl) { // Apply to the movePairEl just created or updated
                 movePairEl.onclick = () => {
                    const tempGame = new Chess();
                    // Play moves up to and including the clicked move's index
                    for(let i = 0; i <= currentMoveIndex; i++) {
                        tempGame.move(history[i]);
                    }
                    renderBoard(tempGame.fen());
                };
            }
        });
        
        historyEl.appendChild(fragment);
        undoBtn.disabled = humanMode ? history.length < 1 : history.length < 2;
    }
function updateCapturedPieces() {
        const initialPieceCounts = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }; // Added king for completeness, though it's not captured in standard play

        // Count pieces currently on the board
        const currentBoardCounts = {
            w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
            b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }
        };

        game.board().flat().forEach(square => {
            if (square) {
                currentBoardCounts[square.color][square.type]++;
            }
        });

        // Store captured pieces for display, along with their *captured color*
        // whiteCapturedForDisplay means: these are pieces that white captured (so they are black pieces)
        const whiteCapturedForDisplay = [];
        // blackCapturedForDisplay means: these are pieces that black captured (so they are white pieces)
        const blackCapturedForDisplay = [];
        
        let whiteMaterialScore = 0; // Total value of white's pieces currently on board (for calculating advantage)
        let blackMaterialScore = 0; // Total value of black's pieces currently on board (for calculating advantage)

        // Calculate captured pieces and material advantage
        // Iterate through piece types in order of value (Q, R, B, N, P)
        const pieceOrder = ['q', 'r', 'b', 'n', 'p'];
        
        for (const type of pieceOrder) {
            // Pieces captured by White (these are Black pieces)
            const capturedBlackCount = initialPieceCounts[type] - currentBoardCounts.b[type];
            if (capturedBlackCount > 0) {
                whiteCapturedForDisplay.push({ type: type, color: 'b', count: capturedBlackCount });
            }
            // Add value of currently existing black pieces to blackMaterialScore
            blackMaterialScore += PIECE_VALUES[type] * currentBoardCounts.b[type];


            // Pieces captured by Black (these are White pieces)
            const capturedWhiteCount = initialPieceCounts[type] - currentBoardCounts.w[type];
            if (capturedWhiteCount > 0) {
                blackCapturedForDisplay.push({ type: type, color: 'w', count: capturedWhiteCount });
            }
            // Add value of currently existing white pieces to whiteMaterialScore
            whiteMaterialScore += PIECE_VALUES[type] * currentBoardCounts.w[type];
        }

        // Calculate net material advantage based on pieces *remaining on the board*
        const netMaterialAdvantage = whiteMaterialScore - blackMaterialScore;

// Render captured pieces for the White player's bucket (which visually sits at the top for white board orientation)
        // This bucket should show pieces captured BY BLACK (i.e., White's lost pieces).
        // Material advantage shown here is for black's perspective (positive means black is up).
        renderCapturedDisplay(whiteCapturedEl, blackCapturedForDisplay, -netMaterialAdvantage);

        // Render captured pieces for the Black player's bucket (which visually sits at the bottom for white board orientation)
        // This bucket should show pieces captured BY WHITE (i.e., Black's lost pieces).
        // Material advantage shown here is for white's perspective (positive means white is up).
        renderCapturedDisplay(blackCapturedEl, whiteCapturedForDisplay, netMaterialAdvantage);    }

    // Helper function to render the captured piece display for one side
    // capturedPiecesArray: [{type: 'p', color: 'b', count: 1}, ...]
    function renderCapturedDisplay(containerEl, capturedPiecesArray, materialAdvantage) {
        containerEl.innerHTML = ''; // Clear existing content

        // Sort captured pieces by value (Q, R, B, N, P) for consistent display
        capturedPiecesArray.sort((a, b) => PIECE_VALUES[b.type] - PIECE_VALUES[a.type]);

        // Render individual captured piece images and counts
        capturedPiecesArray.forEach(p => {
            // Determine the correct SVG piece key based on its type AND color
            const pieceKey = p.color === 'w' ? p.type.toUpperCase() : p.type.toLowerCase();
            
            const img = document.createElement('img');
            img.src = SVG_PIECES[pieceKey]; // Use the correctly cased pieceKey
            img.alt = `${p.count} ${p.color === 'w' ? 'White' : 'Black'} ${p.type} piece${p.count > 1 ? 's' : ''}`; // More descriptive alt text
            img.title = `${p.count} ${p.color === 'w' ? 'White' : 'Black'} ${p.type} piece${p.count > 1 ? 's' : ''} captured`;

            containerEl.appendChild(img);

            if (p.count > 1) {
                const countSpan = document.createElement('span');
                countSpan.className = 'captured-piece-count';
                countSpan.textContent = `x${p.count}`;
                containerEl.appendChild(countSpan);
            }
        });

        // Display material advantage if significant
        // Only show if there's a positive advantage for the side whose bucket this is
        if (materialAdvantage !== 0) {
            const advantageEl = document.createElement('span');
            advantageEl.className = 'material-advantage';
            advantageEl.textContent = materialAdvantage > 0 ? `+${materialAdvantage}` : `${materialAdvantage}`;
            containerEl.appendChild(advantageEl);
        }
    }

function showThinking() { 
        if (thinkingIndicator) thinkingIndicator.classList.add('visible'); 
        if (connectionStatusTextEl) connectionStatusTextEl.textContent = 'Thinking...'; 
        // --- NEW: Enable Force Move button when engine is thinking ---
        if (forceMoveBtn) forceMoveBtn.disabled = false;
        if (flipSwitchBtn) flipSwitchBtn.disabled = true; // Still good to disable flip during thinking
    }
function hideThinking() { 
        clearTimeout(forceMoveTimeout);
        if (thinkingIndicator) thinkingIndicator.classList.remove('visible'); 
        if (!game.isGameOver() && !trainingMode) {
            if (connectionStatusTextEl) connectionStatusTextEl.textContent = 'Ready'; 
        } else if (game.isGameOver()) { // Add specific status for game over
            if (connectionStatusTextEl) connectionStatusTextEl.textContent = 'Game Over';
        }
        // --- NEW: Disable Force Move button when engine is not thinking ---
        if (forceMoveBtn) forceMoveBtn.disabled = true; // Disable when engine is not thinking
        if (flipSwitchBtn) flipSwitchBtn.disabled = false; // Re-enable flip button
    }

    function updateEvaluationBar(score, turn = 'w') {
        if (!evaluationDisplay) return;

        requestAnimationFrame(() => {
            mateInLabel.textContent = '';
            evaluationDisplay.title = `Evaluation: ${score.value}`;

            if (score.type === 'mate') {
                const mateIn = score.value * (turn === 'w' ? 1 : -1);
                mateInLabel.textContent = `M${Math.abs(mateIn)}`;
                evaluationBar.style.transform = `scaleY(${mateIn > 0 ? 1 : 0})`;
                evaluationBar.style.background = mateIn > 0 ? 'var(--success)' : 'var(--danger)';
            } else {
                const evalScore = score.value * (turn === 'w' ? 1 : -1);
                const percentage = Math.max(0, Math.min(1, 0.5 + (evalScore / 100) * 0.5));
                evaluationBar.style.transform = `scaleY(${percentage})`;
                evaluationBar.style.background = 'var(--text-primary)';
            }
        });
    }

    function saveSettings() {
        const settings = {
            darkMode: darkModeToggle.checked,
            soundEnabled: soundToggle.checked,
            autoQueen: document.getElementById('auto-queen-toggle').checked, // Assuming you have this
            highlightMoves: document.getElementById('highlight-moves-toggle').checked, // Assuming you have this
            humanMode: humanModeToggle.checked,
            trainingMode: trainingModeToggle.checked,
            elo: eloSlider.value, // Also save ELO
            contempt: engineContempt // And contempt
        };
        localStorage.setItem('sereneChessSettings', JSON.stringify(settings));
    }

// Helper to apply settings to UI and variables. Does NOT interact with localStorage directly.
function _applySettingsToUI(settings) {
    // Dark Mode
    if (settings.darkMode) {
        document.body.classList.add('dark-mode');
        darkModeToggle.checked = true;
    } else {
        document.body.classList.remove('dark-mode');
        darkModeToggle.checked = false;
    }

    // Sound
    soundToggle.checked = settings.soundEnabled;
    soundEnabled = settings.soundEnabled;

    // Auto-Queen
    const autoQueenToggle = document.getElementById('auto-queen-toggle');
    if (autoQueenToggle) autoQueenToggle.checked = settings.autoQueen;

    // Highlight Moves
    const highlightMovesToggle = document.getElementById('highlight-moves-toggle');
    if (highlightMovesToggle) highlightMovesToggle.checked = settings.highlightMoves;

    // Human vs Human Mode
    humanMode = (settings.humanMode === true);
    humanModeToggle.checked = humanMode;
    engineControls.forEach(control => control.style.opacity = humanMode ? '0.5' : '1');
    engineControls.forEach(control => control.style.pointerEvents = humanMode ? 'none' : 'auto');
    if (humanMode) { // If human mode is enabled, stop engine thinking and clear indicator
        engine.stop();
        hideThinking();
    }

    // Training Mode
    trainingModeToggle.checked = settings.trainingMode;
    trainingMode = settings.trainingMode;

    // Engine ELO
    engineElo = settings.elo; // Set global variable
    eloSlider.value = settings.elo; // Update slider UI
    updateEloLabel(settings.elo); // Update label UI

    // Engine Contempt / Preset
    engineContempt = settings.contempt; // Set global variable
    const foundPresetKey = Object.keys(PRESETS).find(key => PRESETS[key].contempt === engineContempt);
    presetButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.preset === (foundPresetKey || 'balanced')));
    
    // Set engine options only if engine is initialized (handled in engine.onReady)
    // We already moved the engine.setOption calls to engine.onReady and applyDefaultSettingsAndSave
}

// Helper to get default settings
function _getDefaultSettings() {
    return {
        version: SETTINGS_VERSION,
        darkMode: false,
        soundEnabled: false,
        autoQueen: false,
        highlightMoves: true, // Default to true
        humanMode: false,
        trainingMode: false,
        elo: 1800, // Default ELO
        contempt: 0 // Default Contempt (balanced preset)
    };
}

// Main function to save settings to localStorage
function saveSettings() {
    const settingsToSave = {
        version: SETTINGS_VERSION,
        darkMode: darkModeToggle.checked,
        soundEnabled: soundToggle.checked,
        autoQueen: document.getElementById('auto-queen-toggle')?.checked || false, // Use optional chaining + fallback
        highlightMoves: document.getElementById('highlight-moves-toggle')?.checked || false,
        humanMode: humanModeToggle.checked,
        trainingMode: trainingModeToggle.checked,
        elo: eloSlider.value,
        contempt: engineContempt
    };
    try {
        localStorage.setItem('sereneChessSettings', JSON.stringify(settingsToSave));
    } catch (e) {
        console.error('Failed to save settings to localStorage:', e);
        alert('Your browser is blocking local storage. Settings may not be saved.');
    }
}

// Main function to load settings from localStorage
function loadSettings() {
    let settings = _getDefaultSettings(); // Start with defaults
    const savedSettingsString = localStorage.getItem('sereneChessSettings');

    if (savedSettingsString) {
        try {
            const parsedSettings = JSON.parse(savedSettingsString);
            // Check version for compatibility
            if (parsedSettings.version === SETTINGS_VERSION) {
                // Merge loaded settings with defaults to pick up any new properties
                // or ensure all properties exist. Defaults will fill missing values.
                settings = { ...settings, ...parsedSettings };
            } else {
                console.warn(`Settings version mismatch. Saved: ${parsedSettings.version || 'none'}, Current: ${SETTINGS_VERSION}. Applying default settings.`);
                // If version mismatch, defaults will be used, and then saved (effectively resetting)
            }
        } catch (error) {
            console.error("Error parsing saved settings, clearing and applying defaults:", error);
            // If parsing fails (corrupted data), defaults will be used.
        }
    }

    _applySettingsToUI(settings); // Apply whatever settings we ended up with (loaded or default) to UI

    // If we loaded old or no settings, save the current default/merged state with the new version.
    // This cleans up stale data in localStorage for future loads.
    saveSettings(); // Ensure localStorage is updated with the current, valid settings and version
}

    // --- Initialization (runs once, after a user gesture for audio) ---
document.body.addEventListener('click', () => {
    if (!isAudioReady) {
        // --- NEW: Explicitly create and set Tone.context after first user gesture ---
        // This ensures all Tone.js internal nodes are created within an active/resumed AudioContext.
        Tone.context = new Tone.Context(); 
        Tone.start(); // This will resume the newly created context

        isAudioReady = true; // Set flag to true

        // --- Initialize synth here, AFTER AudioContext is started ---
        // Now that Tone.context is initialized, it's safe to create instruments.
        const synth = new Tone.Synth().toDestination();

        // Define the play sound function that uses the *locally* created synth.
        // We'll expose it globally for the `playSound` wrapper function.
        window._playMoveSound = (move) => {
            // `soundEnabled` will be checked by the `playSound` wrapper
            try {
                if (move.flags.includes('c')) synth.triggerAttackRelease("E4", "8n");
                else if (move.flags.includes('k') || move.flags.includes('q')) synth.triggerAttackRelease("G4", "8n");
                else if (game.isCheck() || game.isCheckmate()) synth.triggerAttackRelease("B4", "8n");
                else synth.triggerAttackRelease("C4", "8n");
            } catch (error) {
                console.warn("Could not play sound:", error);
            }
        };

        console.log('AudioContext started and Tone.js initialized!');
    }
    // This line remains outside the `if` block, making `startNewGame` globally callable on first click.
    window.ChessApp = { init: startNewGame }; 
}, { once: true });

    try {
        engine.initialize();
    } catch (err) {
        console.error('Failed to initialize engine:', err);
        if (connectionStatusTextEl) connectionStatusTextEl.textContent = 'Engine load failed';
    }

});