/**
 * Core Adventure Game Engine
 * Manages game state, JSON loading, and navigation.
 */
/**
 * Core Adventure Game Engine
 */
class AdventureGame {
    constructor() {
        this.storyData = null;
        this.surprisePool = null; 
        this.miniGamePool = null;
        this.isButtonBound = false;

        this.state = { 
            currentStoryFile: './assets/mainScreen.json', 
            currentScene: 'game_title_screen', 
            inventory: [] 
        };

        this.miniGameEngine = new MiniGameEngine(this);
    }

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

    async loadAssetsPools() {
        // Get the base path for your repo (handles both localhost and GitHub Pages)
        // If the path contains 'ActionAdventureGame', it includes it in the base.
        const pathParts = window.location.pathname.split('/');
        const repoName = pathParts.includes('ActionAdventureGame') ? '/ActionAdventureGame' : '';
        
        // Consistent use of ./ relative path
        const getPath = (file) => `.${repoName}/assets/${file}`;

        try {
            const [miniGamesRes, surprisesRes] = await Promise.all([
                fetch(getPath('miniGames.json')),
                fetch(getPath('surprises.json'))
            ]);

            if (!miniGamesRes.ok || !surprisesRes.ok) {
                throw new Error(`Failed to load: ${miniGamesRes.status} / ${surprisesRes.status}`);
            }

            this.miniGamePool = await miniGamesRes.json();
            this.surprisePool = await surprisesRes.json();
            
            console.log("Assets loaded! Pool size:", this.surprisePool.length);
        } catch (error) {
            console.error("Critical Failure loading assets:", error);
        }
    }

   async initGame() {
        this.loadGame();
        
        // Explicitly define the path for the initial hub
        const hubPath = "./assets/mainScreen.json";
        
        await this.loadStoryFile(hubPath);
        
        // SAFETY CHECK: If it's still null, stop here to avoid the crash
        if (!this.storyData) {
            console.error("Critical Failure: Could not load hub file at", hubPath);
            return;
        }

        await this.loadAssetsPools();
        
        if (!this.isButtonBound) {
            document.getElementById('reset-btn').addEventListener('click', () => this.resetGame());
            this.isButtonBound = true;
        }
        
        this.handleSceneTransition('game_title_screen');
    }
    // Unified Roll Logic
    rollForSurprise() {
        console.log("🎲 Dice pool size:", this.surprisePool ? this.surprisePool.length : "NULL/EMPTY");

        if (!this.surprisePool || this.surprisePool.length === 0) {
            console.error("❌ ERROR: Surprise Pool is empty! Did loadAssetsPools() run?");
            return null;
        }

        const d20Roll = Math.floor(Math.random() * 20) + 1;
        console.log(`🎲 Systems Check: Rolled a ${d20Roll} for surprise.`);

        // CHANGE: Force trigger on a roll of 1 for testing
        if (d20Roll >= 1 || d20Roll >= 12) { 
            const randomIndex = Math.floor(Math.random() * this.surprisePool.length);
            console.log("✅ Dice check passed! Returning surprise:", this.surprisePool[randomIndex]);
            return this.surprisePool[randomIndex];
        }
        
        return null; 
    }

    render(node = null, surpriseText = "") {
        if (!node) node = this.storyData[this.state.currentScene];
        const storyTextContainer = document.getElementById('story-text');
        const titleContainer = document.getElementById('game-title');
        const buttonContainer = document.getElementById('choices-container');

        titleContainer.innerText = node.title || "Adventure Quest";
        storyTextContainer.innerText = (node.text || "") + surpriseText;
        
        buttonContainer.innerHTML = '';
        node.options.forEach(option => {
            const button = document.createElement('button');
            button.innerText = option.text;
            button.className = 'choice-btn';
            button.addEventListener('click', () => this.makeChoice(option));
            buttonContainer.appendChild(button);
        });
    }

    // Single source of truth for scene movement
    handleSceneTransition(sceneId) {
        console.log("🚦 Entering handleSceneTransition for:", sceneId); // LOG 1
        
        this.state.currentScene = sceneId;
        this.saveGame();
        
        const node = this.storyData[sceneId];
        if (!node) {
            console.error("❌ Node not found:", sceneId);
            return;
        }

        console.log("🧐 Node found. Surprise property is:", node.surprise); // LOG 2

        // 1. Check for surprise before rendering
        if (node.surprise === true) {
        console.log("🎲 About to roll dice...");
        const surprise = this.rollForSurprise();
    
    if (surprise) {
        console.log("🎲 Surprise Triggered!");
        
        // Render the scene text immediately
        this.render(node, surprise.text); 
        
        // ONLY trigger mini-game if a miniGameId exists
        if (surprise.miniGameId) {
            console.log("🎮 Launching associated mini-game:", surprise.miniGameId);
            setTimeout(() => this.miniGameEngine.start(surprise.miniGameId), 1000);
        } else {
            console.log("✨ Surprise effect triggered without a mini-game.");
        }
        return; 
            } else {
                console.log("🎲 Dice rolled, no surprise triggered.");
            }
        } else {
            console.log("⛔ Surprise property was not true, skipping roll."); // LOG 5
        }

        // 2. Default path
        this.render(node);
    }

    async makeChoice(option) {
        console.log("👉 Button clicked: navigating to", option.nextScene);
        if (option.storyFile) {
            await this.loadStoryFile(option.storyFile);
        }
        // This calls the "Brain" that rolls the dice
        this.handleSceneTransition(option.nextScene);
    }

    jumpToScene(sceneId) {
        this.handleSceneTransition(sceneId);
    }

    saveGame() { localStorage.setItem('adventure_game_save', JSON.stringify(this.state)); }

    loadGame() {
        const savedProgress = localStorage.getItem('adventure_game_save');
        if (savedProgress) {
            try { this.state = JSON.parse(savedProgress); } catch (e) { this.resetGame(); }
        }
    }

    resetGame() {
        this.state = { currentStoryFile: './assets/mainScreen.json', currentScene: 'game_title_screen', inventory: [] };
        this.saveGame();
        this.initGame(); 
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