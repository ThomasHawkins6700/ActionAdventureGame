/**
 * Core Adventure Game Engine
 * Manages game state, JSON loading, and navigation.
 */
class AdventureGame {
    constructor() {
        this.storyData = null;
        this.surprisePool = null; 
        this.miniGamePool = null; // Master database of mini-game puzzles
        this.isButtonBound = false;

        this.state = { 
            currentStoryFile: './assets/mainScreen.json', 
            currentScene: 'game_title_screen',       
            inventory: [] 
        };

        // 1. Hook up the Mini-Game Engine and pass this game instance to it
        this.miniGameEngine = new MiniGameEngine(this);
    }

    /**
     * Fetches a story asset file safely
     */
    async loadStoryFile(filePath) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this.storyData = await response.json();
            this.state.currentStoryFile = filePath;
        } catch (error) {
            console.error("Error loading story file:", error);
            this.storyData = null;
        }
    }

    /**
     * Fetches supplemental game data pools
     */
    async loadAssetsPools() {
        // Get the base URL
        const baseUrl = window.location.origin;
        
        // If you are on GitHub pages, your path usually includes the repo name
        // e.g., /my-rpg-adventure/assets/minigames.json
        // We check if we are on localhost vs github.io to be safe
        const path = window.location.hostname.includes('github.io') 
            ? '/your-repo-name-here/assets/minigames.json' 
            : '/assets/minigames.json';

        try {
            const miniGameRes = await fetch(baseUrl + path);
            
            if (!miniGameRes.ok) {
                throw new Error(`HTTP error! status: ${miniGameRes.status}`);
            }
            
            this.miniGamePool = await miniGameRes.json();
            console.log("Assets loaded successfully!");
        } catch (error) {
            console.error("Critical Failure loading assets:", error);
        }
    }

    /**
     * Boots up the game engine and attaches clean event listeners
     */
    async initGame() {
        this.loadGame(); 
        await this.loadStoryFile(this.state.currentStoryFile);
        await this.loadAssetsPools();
        
        // Only bind the button if we haven't done it yet
        if (!this.isButtonBound) {
            document.getElementById('reset-btn').addEventListener('click', () => this.resetGame());
            this.isButtonBound = true; // Mark as bound
        }
        
        this.render();
    }

    /**
     * DnD Core Check: Rolls a d20 to check for a surprise encounter
     */
    rollForSurprise() {
        if (!this.surprisePool || this.surprisePool.length === 0) return null;

        const d20Roll = Math.floor(Math.random() * 20) + 1;
        console.log(`🎲 Systems Check: Rolled a ${d20Roll} for surprise.`);

        if (d20Roll >= 12) {
            const randomIndex = Math.floor(Math.random() * this.surprisePool.length);
            return this.surprisePool[randomIndex];
        }
        return null; 
    }

    /**
     * Updates screen layout elements
     */
    render() {
        const storyTextContainer = document.getElementById('story-text');
        const titleContainer = document.getElementById('game-title');
        const buttonContainer = document.getElementById('choices-container');

        if (!this.storyData) {
            storyTextContainer.innerText = "Failed to load game assets.";
            return;
        }

        const node = this.storyData[this.state.currentScene];
        if (!node) {
            storyTextContainer.innerText = `Error: Scene "${this.state.currentScene}" not found.`;
            return;
        }

        titleContainer.innerText = node.title || "Adventure Quest";

        // --- SURPRISE EVENT TRIGGER WORKFLOW ---
        let finalDisplayTxt = node.text;

        if (node.surprise) {
            const triggeredSurprise = this.rollForSurprise();
            if (triggeredSurprise) {
                finalDisplayTxt += triggeredSurprise.text;
                console.log(`Triggered Effect: ${triggeredSurprise.effect}`);
                
                // Fix: Call the mini-game engine if the surprise features a challenge
                if (triggeredSurprise.miniGameId) {
                    setTimeout(() => this.miniGameEngine.start(triggeredSurprise.miniGameId), 1200);
                }
            }
        }

        storyTextContainer.innerText = finalDisplayTxt;
        buttonContainer.innerHTML = '';
        
        node.options.forEach(option => {
            const button = document.createElement('button');
            button.innerText = option.text;
            button.className = 'choice-btn';
            button.addEventListener('click', () => this.makeChoice(option));
            buttonContainer.appendChild(button);
        });
    }

    async makeChoice(option) {
        if (option.storyFile) {
            await this.loadStoryFile(option.storyFile);
        }
        this.state.currentScene = option.nextScene;
        this.saveGame(); 
        this.render();
    }

    saveGame() {
        localStorage.setItem('adventure_game_save', JSON.stringify(this.state));
    }

    loadGame() {
        const savedProgress = localStorage.getItem('adventure_game_save');
        if (savedProgress) {
            try { this.state = JSON.parse(savedProgress); } catch (e) { this.resetGame(); }
        }
    }

    resetGame() {
        this.state = { 
            currentStoryFile: './assets/mainScreen.json', 
            currentScene: 'game_title_screen', 
            inventory: [] 
        };
        this.saveGame();
        this.initGame(); 
    }

    /**
 * Forces the game to move to a specific scene ID
    */
    jumpToScene(sceneId) {
        this.state.currentScene = sceneId;
        this.saveGame();
        this.render();
    }
}

/**
 * Modular mini-Game Engine
 * Routes and handles puzzle-specific micro-logic states.
 */

class MiniGameEngine {
    constructor(gameInstance) {
        this.game = gameInstance; 
        this.currentPuzzle = null;
        this.playerSequence = []; 
        this.timer = null; // Timer reference for the "Evil" progress bar
    }

    /**
     * Entry Router: Directs the game to its specific puzzle structure execution block
     */
    start(gameId) {
        if (!this.game.miniGamePool) {
            console.warn("mini-game data not loaded yet. Skipping trigger.");
            return;
        }

        this.currentPuzzle = this.game.miniGamePool.find(g => g.id === gameId);
        
        // 2. Also handle cases where the ID might be valid but the game doesn't exist
        if (!this.currentPuzzle) {
            console.error(`mini-game with ID "${gameId}" not found in pool.`);
            return;
        }
        this.currentPuzzle = this.game.miniGamePool.find(g => g.id === gameId);
        if (!this.currentPuzzle) return;

        this.playerSequence = [];
        
        document.getElementById('minigame-modal').style.display = 'flex';
        document.getElementById('minigame-header').innerText = this.currentPuzzle.title;
        
        // ─── UPDATE: ADD THE DESCRIPTION FIELD ───
        // We can add a new div in your HTML or just append it to the clue area.
        // Let's add a clear distinction:
        document.getElementById('minigame-clue').innerHTML = `
            <div style="margin-bottom: 10px; font-weight: bold; color: #fff;">${this.currentPuzzle.description}</div>
            <div style="font-style: italic;">"${this.currentPuzzle.clue}"</div>
        `;

        this.startTimer(10);

        if (this.currentPuzzle.type === "sequence_lock") {
            this.initRunePuzzle();
        } else if (this.currentPuzzle.type === "trivia_quiz") {
            this.initTriviaPuzzle();
        }
    }

    /**
     * Manages the "Evil" timer and visual progress bar
     */
    startTimer(seconds) {
        const fill = document.getElementById('progress-bar-fill');
        let timeLeft = seconds;
        
        if (this.timer) clearInterval(this.timer);

        this.timer = setInterval(() => {
            timeLeft -= 0.1;
            const percent = (timeLeft / seconds) * 100;
            fill.style.width = `${percent}%`;

            if (timeLeft <= 0) {
                clearInterval(this.timer);
                this.endMiniGame(false); // Time's up = automatic fail
            }
        }, 100);
    }

    // ==========================================
    // MODULE 1: RUNIC SEQUENCE PUZZLE LOGIC
    // ==========================================
    
    initRunePuzzle() {
        document.getElementById('minigame-display').innerText = "Current Sequence: 🔒";
        const buttonsContainer = document.getElementById('minigame-buttons');
        buttonsContainer.innerHTML = '';
        
        const shuffledOptions = [...this.currentPuzzle.sequence].sort(() => Math.random() - 0.5);
        
        shuffledOptions.forEach(symbol => {
            const btn = document.createElement('button');
            btn.innerText = symbol;
            btn.className = 'rune-btn';
            btn.addEventListener('click', () => this.handleRuneInput(symbol));
            buttonsContainer.appendChild(btn);
        });
    }

    handleRuneInput(symbol) {
        this.playerSequence.push(symbol);
        document.getElementById('minigame-display').innerText = `Sequence: ${this.playerSequence.join(' ')}`;

        if (this.playerSequence.length === this.currentPuzzle.sequence.length) {
            const isCorrect = this.playerSequence.every((val, index) => val === this.currentPuzzle.sequence[index]);
            this.endMiniGame(isCorrect);
        }
    }

    // ==========================================
    // MODULE 2: TRIVIA / RIDDLE PUZZLE LOGIC
    // ==========================================
    
    initTriviaPuzzle() {
        document.getElementById('minigame-display').innerText = "Choose wisely...";
        const buttonsContainer = document.getElementById('minigame-buttons');
        buttonsContainer.innerHTML = '';

        this.currentPuzzle.choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.innerText = choice;
            btn.className = 'choice-btn';
            btn.addEventListener('click', () => {
                const isCorrect = (choice === this.currentPuzzle.answer);
                this.endMiniGame(isCorrect);
            });
            buttonsContainer.appendChild(btn);
        });
    }

    /**
     * Clean Closing Sequence with Scenario Branching
     */
    endMiniGame(isCorrect) {
        // Stop the timer immediately
        clearInterval(this.timer);

        // Determine outcome destination
        const nextSceneId = isCorrect ? this.currentPuzzle.successScene : this.currentPuzzle.failScene;

        setTimeout(() => {
            alert(isCorrect ? this.currentPuzzle.successText : this.currentPuzzle.failText);
            
            // Close modal
            document.getElementById('minigame-modal').style.display = 'none';

            // Branch to next location
            if (nextSceneId) {
                this.game.jumpToScene(nextSceneId);
            }
        }, 300);
    }
}

// Global initialization hook
const game = new AdventureGame();
window.onload = () => game.initGame();