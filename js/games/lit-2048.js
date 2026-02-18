/**
 * Lit-2048 Game Module
 * Standard 4x4 2048 mechanics with Animation Support (Entity tracking)
 * Fixes: Input throttling and Transform conflicts.
 */

export default class Lit2048 {
    constructor() {
        this.container = null;
        this.gridEl = null;
        this.scoreEl = null;
        this.overlayEl = null;

        this.size = 4;
        this.tiles = []; // Tracks Tile objects { id, x, y, value }
        this.score = 0;
        this.over = false;
        this.won = false;
        this.idCounter = 0;
        this.isAnimating = false; // Input Block flag

        this.handleInput = this.handleInput.bind(this);
    }

    init(container, onEndCallback) {
        this.container = container;
        this.onEnd = onEndCallback;

        // Setup DOM
        this.container.innerHTML = `
            <div class="game-container-2048 glass-panel">
                <div class="game-header">
                    <h2>2048</h2>
                    <div class="score-box glass-panel" style="padding: 5px 15px;">
                        Score: <span id="game-score">0</span>
                    </div>
                </div>
                <div class="game-grid" id="game-grid">
                    ${Array(16).fill('<div class="grid-cell"></div>').join('')}
                    <div id="tile-container"></div>
                </div>
                <div id="game-overlay" style="display:none; text-align:center; padding: 20px; flex-direction: column; align-items: center;">
                    <h3 id="overlay-msg">Game Over!</h3>
                    <div style="display: flex; gap: 15px; margin-top: 20px;">
                        <button id="restart-btn" class="btn-neon">Try Again</button>
                        <button id="exit-btn" class="btn-neon" style="border-color: #ff3333; color: #ff3333;">Exit</button>
                    </div>
                </div>
            </div>
        `;

        this.gridEl = this.container.querySelector('#game-grid');
        this.tileContainer = this.container.querySelector('#tile-container');
        this.scoreEl = this.container.querySelector('#game-score');
        this.overlayEl = this.container.querySelector('#game-overlay');

        this.container.querySelector('#restart-btn').addEventListener('click', () => {
            // Record the finished game's stats before restarting
            if (this.onEnd) {
                let maxTile = 0;
                this.tiles.forEach(t => maxTile = Math.max(maxTile, t.value));
                this.onEnd({ score: this.score, maxTile: maxTile, restart: true });
            }
            this.start();
        });
        this.container.querySelector('#exit-btn').addEventListener('click', () => this.endGame());

        document.addEventListener('keydown', this.handleInput);
    }

    start() {
        this.score = 0;
        this.tiles = [];
        this.over = false;
        this.won = false;
        this.isAnimating = false;
        this.overlayEl.style.display = 'none';

        this.tileContainer.innerHTML = '';

        this.addRandomTile();
        this.addRandomTile();
        this.render();
    }

    endGame(silent = false) {
        document.removeEventListener('keydown', this.handleInput);
        if (!silent && this.onEnd) {
            let maxTile = 0;
            this.tiles.forEach(t => maxTile = Math.max(maxTile, t.value));
            this.onEnd({
                score: this.score,
                maxTile: maxTile
            });
        }
    }

    // --- Core Logic ---

    getTile(x, y) {
        return this.tiles.find(t => t.x === x && t.y === y && !t.mergedDelete);
    }

    addRandomTile() {
        const emptyCells = [];
        for (let x = 0; x < this.size; x++) {
            for (let y = 0; y < this.size; y++) {
                if (!this.getTile(x, y)) {
                    emptyCells.push({ x, y });
                }
            }
        }

        if (emptyCells.length > 0) {
            const { x, y } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            const val = Math.random() < 0.9 ? 2 : 4;

            this.tiles.push({
                id: this.idCounter++,
                x,
                y,
                value: val,
                isNew: true
            });
        }
    }

    render() {
        this.scoreEl.textContent = this.score;

        this.tiles.forEach(tile => {
            let wrapper = document.getElementById(`tile-wrapper-${tile.id}`);

            if (!wrapper) {
                // Create Wrapper (Positioning)
                wrapper = document.createElement('div');
                wrapper.id = `tile-wrapper-${tile.id}`;
                wrapper.className = 'tile-wrapper';

                // Create Inner (Styling & Animation)
                const inner = document.createElement('div');
                inner.className = `tile-inner tile-${tile.value}`;
                inner.textContent = tile.value;
                if (tile.value > 2048) inner.classList.add('tile-2048');

                if (tile.isNew) {
                    inner.classList.add('tile-new');
                    tile.isNew = false;
                }

                wrapper.appendChild(inner);
                this.updateTilePosition(wrapper, tile.x, tile.y);
                this.tileContainer.appendChild(wrapper);
            } else {
                // Update
                const inner = wrapper.querySelector('.tile-inner');
                if (inner.textContent != tile.value) {
                    inner.textContent = tile.value;
                    inner.className = `tile-inner tile-${tile.value}`; // Reset classes
                    inner.classList.add('tile-merged'); // Add merge animation
                }

                this.updateTilePosition(wrapper, tile.x, tile.y);
            }
        });

        // Cleanup removed tiles
        Array.from(this.tileContainer.children).forEach(wrapper => {
            const parts = wrapper.id.split('-');
            const id = parseInt(parts[2]); // tile-wrapper-ID
            const foundNode = this.tiles.find(t => t.id === id);

            if (!foundNode) {
                // Should only happen if my logic is bad, or after merge delay
                wrapper.remove();
            } else if (foundNode.mergedDelete) {
                this.updateTilePosition(wrapper, foundNode.x, foundNode.y);
                wrapper.style.zIndex = '5'; // Below new tile
                // Schedule removal
                setTimeout(() => wrapper.remove(), 100);
            }
        });

        this.tiles = this.tiles.filter(t => !t.mergedDelete);
    }

    updateTilePosition(el, x, y) {
        // Updated for 15px gap
        // 100% refers to tile width.
        // We need to shift by TileWidth + Gap
        el.style.transform = `translate(calc(${x} * (100% + 15px)), calc(${y} * (100% + 15px)))`;
    }

    handleInput(e) {
        if (this.over || this.isAnimating) return;

        // Use e.code for layout-independent WASD (works with Cyrillic/Ukrainian)
        const keyMap = {
            'ArrowUp': { x: 0, y: -1 },
            'ArrowDown': { x: 0, y: 1 },
            'ArrowLeft': { x: -1, y: 0 },
            'ArrowRight': { x: 1, y: 0 },
            'KeyW': { x: 0, y: -1 },
            'KeyS': { x: 0, y: 1 },
            'KeyA': { x: -1, y: 0 },
            'KeyD': { x: 1, y: 0 }
        };
        const vector = keyMap[e.code];
        if (!vector) return;

        e.preventDefault();
        const moved = this.move(vector);

        if (moved) {
            this.isAnimating = true; // Block input
            setTimeout(() => {
                this.addRandomTile();
                this.render();
                this.isAnimating = false; // Unblock

                if (this.checkGameOver()) {
                    this.over = true;
                    this.overlayEl.querySelector('#overlay-msg').textContent = 'No moves left!';
                    this.overlayEl.style.display = 'flex';
                }
            }, 100); // 100ms matches CSS transition
        }
    }

    move(vector) {
        let moved = false;
        const xOrder = vector.x === 1 ? [3, 2, 1, 0] : [0, 1, 2, 3];
        const yOrder = vector.y === 1 ? [3, 2, 1, 0] : [0, 1, 2, 3];

        this.tiles.forEach(t => t.mergedFrom = null);

        xOrder.forEach(x => {
            yOrder.forEach(y => {
                const tile = this.getTile(x, y);
                if (tile) {
                    const cell = { x: tile.x, y: tile.y };
                    let next = { x: cell.x + vector.x, y: cell.y + vector.y };

                    while (
                        next.x >= 0 && next.x < 4 &&
                        next.y >= 0 && next.y < 4 &&
                        !this.getTile(next.x, next.y)
                    ) {
                        cell.x = next.x;
                        cell.y = next.y;
                        next = { x: cell.x + vector.x, y: cell.y + vector.y };
                    }

                    const nextTile = this.getTile(next.x, next.y);
                    if (
                        nextTile &&
                        nextTile.value === tile.value &&
                        !nextTile.mergedFrom
                    ) {
                        const merged = {
                            id: this.idCounter++,
                            x: next.x,
                            y: next.y,
                            value: tile.value * 2,
                            mergedFrom: [tile, nextTile]
                        };

                        tile.x = next.x;
                        tile.y = next.y;
                        tile.mergedDelete = true;
                        nextTile.mergedDelete = true;

                        this.tiles.push(merged);
                        this.score += merged.value;
                        moved = true;
                    } else if (cell.x !== tile.x || cell.y !== tile.y) {
                        tile.x = cell.x;
                        tile.y = cell.y;
                        moved = true;
                    }
                }
            });
        });

        if (moved) this.render();
        return moved;
    }

    checkGameOver() {
        if (this.tiles.length < 16) return false;
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < 4; y++) {
                const tile = this.getTile(x, y);
                if (!tile) return false;
                const neighbors = [this.getTile(x + 1, y), this.getTile(x, y + 1)];
                for (let n of neighbors) {
                    if (n && n.value === tile.value) return false;
                }
            }
        }
        return true;
    }
}
