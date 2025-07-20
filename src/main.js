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

    // --- NEW: Enhanced configuration with delight-focused animations ---
    const ANIMATION_CONFIG = {
        // Base durations - now faster for snappier feel
        minDuration: 120,
        maxDuration: 280,
        baseDuration: 180,

        // Multiple easing curves for different situations
        easing: {
            normal: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Slight bounce for satisfaction
            capture: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)', // More dramatic for captures
            check: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', // Smooth for checks
            castle: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' // Gentle bounce for castling
        },

        zIndex: 1000, // Z-index for flying pieces

        // Visual feedback timing
        feedback: {
            pieceLifeDuration: 80,
            squareHighlightDuration: 200,
            captureShakeDuration: 150,
            checkPulseDuration: 300
        }
    };
    // --- END NEW ---

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
    let synth = null; 

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
                // --- CRITICAL FIX: Apply loaded/default ELO and Contempt to the engine here ---
        // These values (`engineElo`, `engineContempt`) are now correctly set by `loadSettings()`.
        engine.setOption('UCI_Elo', engineElo);
        engine.setOption('Contempt', engineContempt);
        loadingOverlay.classList.add('hidden');
        // --- END CRITICAL FIX ---
        
        connectionStatusTextEl.textContent = 'Ready'; // Engine is ready
        connectionIndicatorEl.style.backgroundColor = 'var(--success)'; // Green for ready

        startNewGame();
    };
    engine.onInfo = (info) => { if (info.score) updateEvaluationBar(info.score, game.turn()); };
    engine.onBestMove = (moveStr) => {
        const move = game.move(moveStr, { sloppy: true });
        if (move) {
            playSound(move);
            lastMove = move;
            updateBoardAfterMove(move); // This is correct
        }
        hideThinking();
        updateHistory();
        updateCapturedPieces();
        checkGameOver();
        updateTurnIndicator();
    };
    engine.onError = (err) => console.error('[ENGINE ERROR]', err);


// Find and replace the entire playSound function
function playSound(move) {
    // Only play sound if it's enabled AND the synth has been initialized
    if (soundEnabled && synth) {
        try {
            if (move.captured) { // More reliable check for captures
                synth.triggerAttackRelease("E4", "8n");
            } else if (move.flags.includes('k') || move.flags.includes('q')) {
                synth.triggerAttackRelease("G4", "8n"); // Castle
            } else if (move.san.includes('#') || move.san.includes('+')) { // Check for check/mate in SAN
                synth.triggerAttackRelease("B4", "8n"); // Check or Checkmate
            } else {
                synth.triggerAttackRelease("C4", "8n"); // Normal move
            }
        } catch (error) {
            console.warn("Could not play sound:", error);
        }
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
        moveHistoryToggleEl.classList.add('collapsed'); // Default to collapsed on mobile
        historyEl.classList.add('collapsed');
        historyEl.style.maxHeight = '0px'; // Ensure it's visually collapsed
        historyEl.style.display = 'block'; // Make sure it's block so max-height transition works
    } else {
        moveHistoryToggleEl.classList.remove('collapsed'); // Always expanded on desktop
        historyEl.classList.remove('collapsed');
        historyEl.style.maxHeight = '250px'; // Restore default desktop height
        historyEl.style.display = 'block';
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
        // Only allow toggling if currently in mobile mode
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
        loadingOverlay.classList.remove('hidden');
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
        if (game.isGameOver() || trainingMode) return;
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
        if (game.turn() !== playerColor && !trainingMode && !game.isGameOver()) {
            requestEngineMove(true); // 'true' signals this is an immediate/fast first move of engine's turn
        }
            // --- NEW: Ensure full UI state is consistent when game flow starts ---
        updateHistory();       // Re-render history for current game state (clears old if new game)
        updateCapturedPieces(); // Re-render captured pieces for current game state (clears old if new game)
        // --- END NEW ---

        // Update button states based on the new game state
        // Undo button enabled if there's history, disabled if not (or only 1 move if trainingMode)
        undoBtn.disabled = trainingMode ? game.history().length < 1 : game.history().length < 2;
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

    function clearTemporaryHighlights() {
    document.querySelectorAll('.square.move-from-highlight, .square.move-to-preview').forEach(el => {
        el.classList.remove('move-from-highlight', 'move-to-preview');
    });
}
// --- Board Rendering ---
// Modified to accept an explicit desiredOrientation for immediate flips
function renderBoard(fen = game.fen(), desiredOrientation = boardOrientation) { // Add desiredOrientation parameter
    // Before rendering, clear all existing drag-over classes to prevent stickiness
    document.querySelectorAll('.square.drag-over').forEach(sq => sq.classList.remove('drag-over'));
    clearTemporaryHighlights();
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
            squareEl.addEventListener('dragleave', (e) => e.currentTarget.classList.remove('drag-over'));
            squareEl.addEventListener('click', () => onSquareClick(squareName));

            // If there's a piece on this square, create and append its image
            if (piece) {
                const pieceKey = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
                const pieceImg = document.createElement('img');
                pieceImg.src = SVG_PIECES[pieceKey];
                pieceImg.classList.add('chess-piece');
                
                // Make pieces draggable only for the current human player or in human vs human mode
            if ((piece.color === playerColor && !trainingMode) || (trainingMode && piece.color === tempGame.turn())) {
                // Add our new universal drag listeners for both mouse and touch
                pieceImg.addEventListener('mousedown', dragStart);
                pieceImg.addEventListener('touchstart', dragStart, { passive: false });
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
// PASTE THIS NEW BLOCK FOR DRAG AND DROP
// PASTE THIS ENTIRE NEW BLOCK OF CODE

// --- Universal Drag and Drop Logic ---

let draggedElement = null;  // The visual clone of the piece being dragged
let startSquare = null;     // The square the drag started from ('e2', 'f6', etc.)

function dragStart(event) {
    // Find the piece element that was clicked or touched
    const pieceEl = event.target;
    if (!pieceEl.classList.contains('chess-piece')) return;

    event.preventDefault(); // Prevent default browser actions (like text selection or image drag)

    startSquare = pieceEl.parentElement.dataset.square;

    // Create a visual clone of the piece for dragging
    draggedElement = pieceEl.cloneNode(true);
    const rect = pieceEl.getBoundingClientRect();

    // Style the clone to look "lifted" and position it correctly
    Object.assign(draggedElement.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        zIndex: 1000,
        pointerEvents: 'none', // Allow events to pass through to squares underneath
        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))'
    });

    document.body.appendChild(draggedElement); // Add the clone to the page
    pieceEl.style.opacity = '0.5'; // Make the original piece transparent

    // Position the clone based on initial event
    dragMove(event);

    // Add listeners to the whole document to track movement and release
    if (event.type === 'mousedown') {
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', dragEnd, { once: true });
    } else { // Touch event
        document.addEventListener('touchmove', dragMove);
        document.addEventListener('touchend', dragEnd, { once: true });
    }
}

function dragMove(event) {
    if (!draggedElement) return;

    // Get the correct coordinates for either mouse or touch
    const x = event.touches ? event.touches[0].clientX : event.clientX;
    const y = event.touches ? event.touches[0].clientY : event.clientY;

    // Update the clone's position to follow the cursor/finger
    requestAnimationFrame(() => {
        draggedElement.style.left = `${x - draggedElement.offsetWidth / 2}px`;
        draggedElement.style.top = `${y - draggedElement.offsetHeight / 2}px`;
    });
}

function dragEnd(event) {
    // Clean up the event listeners
    document.removeEventListener('mousemove', dragMove);
    document.removeEventListener('touchmove', dragMove);

    if (!draggedElement) return;

    // Get the coordinates of the drop
    const x = event.changedTouches ? event.changedTouches[0].clientX : event.clientX;
    const y = event.changedTouches ? event.changedTouches[0].clientY : event.clientY;

    // Find the element underneath the drop point
    const dropTarget = document.elementFromPoint(x, y);
    const endSquareEl = dropTarget?.closest('.square');
    const endSquare = endSquareEl?.dataset.square;

    // Make the original piece visible again
    const originalPieceEl = document.querySelector(`[data-square="${startSquare}"] .chess-piece`);
    if (originalPieceEl) originalPieceEl.style.opacity = '1';

    // Remove the visual clone from the page
    document.body.removeChild(draggedElement);
    draggedElement = null;

    // If we dropped on a valid square, handle the move
    if (startSquare && endSquare) {
        handlePlayerMove(startSquare, endSquare);
    } else {
        // If dropped outside the board, just refresh the board to be safe
        renderBoard(game.fen(), boardOrientation);
    }
}
// --- Drag, Drop, and Touch Handlers ---



// PASTE THIS ENTIRE BLOCK

// --- Move Execution ---

// This is the new, single function that handles all player moves.
function handlePlayerMove(from, to) {
    // Find the move in the list of legal moves to validate it.
    const legalMove = game.moves({ square: from, verbose: true }).find(m => m.to === to);

    if (!legalMove) {
        // If the move is illegal, just re-render the board once to cancel any visual selection.
        renderBoard(game.fen(), boardOrientation);
        return;
    }

    // If the move is legal, apply it to the game state.
    // We default to 'queen' for promotions to keep this fix simple.
    const result = game.move({ from, to, promotion: 'q' });

    if (result) {
        playSound(result);
        lastMove = result;
        updateBoardAfterMove(result); // This is our new efficient updater.

        // Update the rest of the UI.
        updateHistory();
        updateCapturedPieces();
        if (checkGameOver()) return;

        // This is the key logic: if training mode is OFF, now it's the engine's turn.
        if (!trainingMode) {
            requestEngineMove();
        }
    }
}


// PASTE THIS NEW FUNCTION

function updateBoardAfterMove(move) {
    const fromEl = document.querySelector(`[data-square="${move.from}"]`);
    const toEl = document.querySelector(`[data-square="${move.to}"]`);

    // If it was a capture, the 'to' square has a piece. We remove it first.
    if (move.flags.includes('c')) {
        toEl.innerHTML = '';
    }

    // Move the piece's image element from the 'from' square to the 'to' square.
    if (fromEl && fromEl.firstChild) {
        toEl.appendChild(fromEl.firstChild);
    }

    // Manually handle the rook's movement during castling.
    if (move.flags.includes('k')) { // Kingside
        const rookFromEl = document.querySelector(`[data-square="h${move.from[1]}"]`);
        const rookToEl = document.querySelector(`[data-square="f${move.from[1]}"]`);
        if (rookFromEl && rookFromEl.firstChild) rookToEl.appendChild(rookFromEl.firstChild);
    } else if (move.flags.includes('q')) { // Queenside
        const rookFromEl = document.querySelector(`[data-square="a${move.from[1]}"]`);
        const rookToEl = document.querySelector(`[data-square="d${move.from[1]}"]`);
        if (rookFromEl && rookFromEl.firstChild) rookToEl.appendChild(rookFromEl.firstChild);
    }

    // Update the visual highlight for the last move.
    document.querySelectorAll('.last-move').forEach(el => el.classList.remove('last-move'));
    fromEl.classList.add('last-move');
    toEl.classList.add('last-move');
}



// This function now only handles the simple click-to-move interaction.
function onSquareClick(square) {
    if (!selectedSquare) {
        const piece = game.get(square);
        // Check if it's a piece the player can move.
        if (piece && ((piece.color === playerColor && !trainingMode) || (trainingMode && piece.color === game.turn()))) {
            selectedSquare = square;
            renderBoard(game.fen(), boardOrientation); // Re-render to show selection.
        }
    } else {
        // If a square was already selected, attempt the move.
        handlePlayerMove(selectedSquare, square);
        selectedSquare = null;
    }
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
        if (trainingMode) {
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
        if (game.turn() !== playerColor && !trainingMode && !game.isGameOver()) {
            engine.stop(); // This command usually makes Stockfish output its bestmove immediately
            // Note: engine.stop() also triggers engine.onBestMove, which will call startGameFlow() indirectly.
        }
        // Force button should disable itself as soon as the engine starts thinking again or it's no longer engine's turn
        forceMoveBtn.disabled = true;
    });

        // --- Add this entire block to fix the preset buttons ---
    presetButtons.forEach(button => {
        button.addEventListener('click', () => {
            const presetName = button.dataset.preset;
            if (presetName) {
                applyPreset(presetName);
            }
        });
    });

function applyPreset(presetName) {
    const preset = PRESETS[presetName];
    if (!preset) return;

    // Visual highlight: Remove 'active' from all, add to clicked button
    presetButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-preset="${presetName}"]`).classList.add('active');

    engineContempt = preset.contempt; // Update global variable

    // Inform the engine immediately of the new contempt setting
    if (engine && engine.setOption) { // Defensive check
        engine.setOption('Contempt', engineContempt); 
    }

    // Save settings AFTER updating contempt
    saveSettings(); 

    // If it's currently the engine's turn and not human mode, make it re-evaluate
    if (!checkGameOver() && game.turn() !== playerColor && !trainingMode) {
         requestEngineMove(true); // Re-evaluate with new preset quickly
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

    // ADD THIS NEW, CORRECT LISTENER
// PASTE THIS SINGLE, CORRECT LISTENER
// PASTE THIS AS THE ONLY LISTENER FOR THE TRAINING MODE TOGGLE

trainingModeToggle.addEventListener('change', (e) => {
    // 1. Update the state from the checkbox's new state.
    trainingMode = e.target.checked;
    saveSettings(); // Save the new preference.

    // 2. Update the UI: Grey out the engine controls if Training Mode is ON.
    const isEngineDisabled = trainingMode;
    const enginePresetPanel = document.querySelector('[data-preset="defender"]')?.closest('.panel-section');
    const engineStrengthPanel = document.getElementById('elo-slider')?.closest('.panel-section');
    
    [enginePresetPanel, engineStrengthPanel].forEach(panel => {
        if (panel) {
            panel.style.opacity = isEngineDisabled ? '0.5' : '1';
            panel.style.pointerEvents = isEngineDisabled ? 'none' : 'auto';
        }
    });

    // 3. Re-render the board immediately. This is crucial because it updates
    //    which pieces are draggable.
    //    - In Training Mode (ON): You can move pieces for whosever turn it is.
    //    - When OFF: You can only move your own pieces.
    renderBoard(game.fen(), boardOrientation);

    // 4. If the engine was just turned ON (Training Mode OFF) and it's the 
    //    engine's turn to move, tell it to think.
    if (!isEngineDisabled && game.turn() !== playerColor && !game.isGameOver()) {
        requestEngineMove();
    }
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

// REPLACE the old "Force Toggle" block with this one
// --- Enhanced Toggle Interaction for Mobile ---
document.querySelectorAll('.settings-modal .toggle-group').forEach(group => {
    group.addEventListener('click', (e) => {
        const input = group.querySelector('input[type="checkbox"]');
        
        // If the click is on a button or the input itself, let the browser handle it.
        if (!input || e.target.tagName === 'BUTTON' || e.target === input) {
            return;
        }

        // Otherwise, manually flip the state and trigger the 'change' event.
        input.checked = !input.checked;
        input.dispatchEvent(new Event('change', { 'bubbles': true }));
    });
});
// --- Settings Modal Logic (replaces the three old listeners) ---

function toggleSettingsModal(show) {
    // We check for settingsModal's existence here for safety
    if (settingsModal) {
        settingsModal.style.display = show ? 'block' : 'none';
    }
}

    // 1. Listener for the gear icon to open the modal
    if (settingsIcon) {
        settingsIcon.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevents the click from reaching the document and closing the modal
            const isVisible = settingsModal.style.display === 'block';
            toggleSettingsModal(!isVisible);
        });
    }

    // 2. Listener for the "Close" button inside the modal
    const closeSettingsBtn = document.getElementById('close-settings');
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => toggleSettingsModal(false));
    }

    // 3. Listener to prevent clicks *inside* the modal from closing it
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => e.stopPropagation());
    }

    // 4. Listener on the whole document to close the modal if you click *outside*
    document.addEventListener('click', () => toggleSettingsModal(false));

function updateHistory() {
    if (!historyEl) return;
    historyEl.innerHTML = '';

    if (isMobile && !trainingMode) return;

    if (isMobile && !historyEl.classList.contains('collapsed')) {
        historyEl.style.maxHeight = historyEl.scrollHeight + 'px';
    }

    const history = game.history({ verbose: true });

    if (history.length === 0) {
        historyEl.innerHTML = `<div style="text-align: center; color: var(--text-tertiary); padding: var(--space-lg) 0; font-style: italic;">Game moves will appear here</div>`;
        undoBtn.disabled = true;
        return;
    }

    const fragment = document.createDocumentFragment();
    let movePairEl = null;

    history.forEach((move, index) => {
        const moveNumber = Math.floor(index / 2) + 1;
        const isWhitesMove = index % 2 === 0;

        if (isWhitesMove) {
            movePairEl = document.createElement('div');
            movePairEl.classList.add('move-pair');
            movePairEl.innerHTML = `<div class="move-number">${moveNumber}.</div>`;

            const whiteMoveSpan = document.createElement('span');
            whiteMoveSpan.classList.add('move');
            whiteMoveSpan.textContent = move.san;
            movePairEl.appendChild(whiteMoveSpan);

            const blackMoveSpan = document.createElement('span');
            blackMoveSpan.classList.add('move');
            movePairEl.appendChild(blackMoveSpan);

            fragment.appendChild(movePairEl);
        } else {
            if (movePairEl) {
                movePairEl.children[2].textContent = move.san;
            }
        }
    });

    historyEl.appendChild(fragment);
    undoBtn.disabled = trainingMode ? history.length < 1 : history.length < 2;

    // --- NEW: Auto-scroll to the latest move ---
    historyEl.scrollTop = historyEl.scrollHeight;
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

// Helper to apply settings to UI and variables. Does NOT interact with localStorage directly.
// PASTE THIS CORRECTED VERSION
// PASTE THIS CORRECTED VERSION
function _applySettingsToUI(settings) {
    // Dark Mode
    document.body.classList.toggle('dark-mode', settings.darkMode);
    darkModeToggle.checked = settings.darkMode;

    // Sound
    soundToggle.checked = settings.soundEnabled;
    soundEnabled = settings.soundEnabled;

    // Highlight Moves
    const highlightMovesToggle = document.getElementById('highlight-moves-toggle');
    if (highlightMovesToggle) highlightMovesToggle.checked = settings.highlightMoves;

    // Training Mode (Single, clear source of truth)
    trainingMode = settings.trainingMode;
    trainingModeToggle.checked = settings.trainingMode;

    // Engine ELO
    engineElo = settings.elo;
    eloSlider.value = settings.elo;
    updateEloLabel(settings.elo);

    // Engine Contempt / Preset
    engineContempt = settings.contempt;
    const presetToActivate = Object.keys(PRESETS).find(key => PRESETS[key].contempt === engineContempt) || 'balanced';
    presetButtons.forEach(btn => btn.classList.remove('active'));
    const btnToActivate = document.querySelector(`[data-preset="${presetToActivate}"]`);
    if (btnToActivate) btnToActivate.classList.add('active');
}

// Helper to get default settings
function _getDefaultSettings() {
    return {
        version: SETTINGS_VERSION,
        darkMode: false,
        soundEnabled: false,
        autoQueen: false,
        highlightMoves: true, // Default to true
        trainingMode: false,
        elo: 3000, // Default ELO
        contempt: 50 // Default Contempt (balanced preset)
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
            if (parsedSettings.version === SETTINGS_VERSION) {
                settings = { ...settings, ...parsedSettings };
                console.log('Settings loaded:', settings);
            } else {
                console.warn(`Settings version mismatch. Saved: ${parsedSettings.version || 'none'}, Current: ${SETTINGS_VERSION}. Applying default settings.`);
            }
        } catch (error) {
            console.error("Error parsing saved settings, applying defaults:", error);
        }
    }

    _applySettingsToUI(settings); // Apply whatever settings we ended up with (loaded or default) to UI

    // No direct engine.setOption here. engine.onReady will handle initial engine setup.
    // When applyPreset or updateElo are called later, they will call engine.setOption.

    // Ensure localStorage is updated with current valid settings (and the latest version)
    saveSettings(); 
}

    // --- Initialization (runs once, after a user gesture for audio) ---
// Find and replace the entire body click listener at the end of the file
    document.body.addEventListener('click', async () => {
        if (!isAudioReady) {
            try {
                // Tone.start() is the most reliable way to start the AudioContext
                await Tone.start();
                // Now that the context is running, it's safe to create instruments
                synth = new Tone.Synth().toDestination();
                isAudioReady = true;
                console.log('AudioContext started and synth initialized!');
            } catch (error) {
                console.error("Could not start audio context:", error);
                // Disable sound if it fails to start, to prevent future errors
                soundEnabled = false; 
                if(soundToggle) soundToggle.checked = false;
            }
        }
    }, { once: true });

    try {
        engine.initialize();
    } catch (err) {
        console.error('Failed to initialize engine:', err);
        if (connectionStatusTextEl) connectionStatusTextEl.textContent = 'Engine load failed';
    }

});