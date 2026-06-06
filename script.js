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
        this.player = new Player("Ashton");
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
    const miniGamesRes = await fetch(`./assets/miniGames.json?t=${Date.now()}`);
    this.miniGamePool = await miniGamesRes.json();
    
    console.log("✅ New Pool Loaded:", this.miniGamePool);
    // 1. Get the current path (e.g., /ActionAdventureGame/index.html)
    // 2. We extract the base directory to ensure we always point to the project root
    const pathParts = window.location.pathname.split('/');
    const repoName = pathParts[1]; // This captures 'ActionAdventureGame'
    const baseUrl = `/${repoName}`;

    // Now we build the path using the detected base
    const miniGamesPath = `${baseUrl}/assets/miniGames.json`;
    const surprisesPath = `${baseUrl}/assets/surprises.json`;

    try {
        const [miniGamesRes, surprisesRes] = await Promise.all([
            fetch(miniGamesPath),
            fetch(surprisesPath)
        ]);

        if (!miniGamesRes.ok || !surprisesRes.ok) {
            throw new Error(`Failed to load: ${miniGamesRes.status}`);
        }

        this.miniGamePool = await miniGamesRes.json();
        this.surprisePool = await surprisesRes.json();
        
        console.log("Assets loaded! Path used:", miniGamesPath);
    } catch (error) {
        console.error("Critical Failure:", error);
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
    rollForSurprise(node) {
        if (!this.surprisePool || this.surprisePool.length === 0) {
            console.error("❌ ERROR: Surprise Pool is empty!");
            return null;
        }
 
        let pool = this.surprisePool;
        
        // 1. Filter and clean the pool
        if (node && node.allowedSurpriseEffects) {
            const uniqueAllowed = [...new Set(node.allowedSurpriseEffects)];
            
            // Check if the allowed effect is in either the effect OR the miniGameId field
            const tempPool = this.surprisePool.filter(s => 
                uniqueAllowed.includes(s.effect) || uniqueAllowed.includes(s.miniGameId)
            );
                            
            pool = [...new Map(tempPool.map(item => [item.effect || item.miniGameId, item])).values()];
            
            console.log(`🎲 Filtered pool to ${pool.length} UNIQUE candidates.`);
        }

        if (pool.length === 0) return null;

        // 2. Perform the roll (e.g., 12 or higher for a surprise)
        const d20Roll = Math.floor(Math.random() * 20) + 1;
        console.log(`🎲 Systems Check: Rolled a ${d20Roll}`);

        if (d20Roll >= 12) { 
            const randomIndex = Math.floor(Math.random() * pool.length);
            const selected = pool[randomIndex];
            console.log("✅ Surprise triggered:", selected.effect);
            return selected;
        }
        
        return null; 
    }

    // AdventureGame.js
    render(node = null) {
        if (!node) node = this.storyData[this.state.currentScene];
        
        // Clear existing timer and reset UI
        if (this.sceneTimer) clearTimeout(this.sceneTimer);
        const container = document.getElementById('game-container');
        const timerBar = document.getElementById('timer-bar-bg');
        const timerFill = document.getElementById('timer-bar-fill');

        // Handle Timed Scene
        if (node.timer) {
            container.classList.add('timed-scene');
            timerBar.style.display = 'block';
            
            // Setup transition
            timerFill.style.transition = `width ${node.timer}s linear`;
            timerFill.style.width = '100%';
            
            // Trigger shrink (delayed slightly so the CSS transition kicks in)
            requestAnimationFrame(() => {
                timerFill.style.width = '0%';
            });

            this.sceneTimer = setTimeout(() => {
                this.handleSceneTransition(node.timeoutScene);
            }, node.timer * 1000);
        } else {
            container.classList.remove('timed-scene');
            timerBar.style.display = 'none';
        }

        // Update Text and Buttons (as before)
        document.getElementById('game-title').innerText = node.title || "Adventure Quest";
        document.getElementById('story-text').innerHTML = node.text || "";
        
        // 3. Clear and Rebuild Buttons
        const buttonContainer = document.getElementById('choices-container');
        buttonContainer.innerHTML = '';
        
        (node.options || []).forEach(option => {
            // --- ADDED: Requirement Logic ---
            if (option.requiredItem) {
                // If player doesn't have the item, skip creating this button
                if (!this.player.inventory.includes(option.requiredItem)) {
                    return; 
                }
            }
            // --------------------------------

            const button = document.createElement('button');
            button.innerText = option.text;
            button.className = 'choice-btn';
            button.addEventListener('click', () => this.makeChoice(option));
            buttonContainer.appendChild(button);
        });
    }

    // Single source of truth for scene movement
    handleSceneTransition(sceneId) {
        this.state.currentScene = sceneId;
        this.saveGame();
        
        const node = this.storyData[sceneId];
        if (!node) {
            console.error("❌ Node not found:", sceneId);
            return;
        }

        // 1. Process Surprise once
        if (node.surprise === true) {
            const surprise = this.rollForSurprise(node);
            
            if (surprise) {
                // Difficulty Roll
                let difficulty = 1;
                if (Array.isArray(node.surpriseDifficultyRange)) {
                    const [min, max] = node.surpriseDifficultyRange;
                    difficulty = Math.floor(Math.random() * (max - min + 1)) + min;
                    console.log(`🎲 Difficulty Roll: [${min}, ${max}] = ${difficulty}`);
                }
                
                // Only trigger engine if we have a valid miniGameId
                if (surprise.miniGameId) {
                    this.miniGameEngine.start(surprise.miniGameId, difficulty);
                }
            } else {
                console.log("🎲 Dice rolled, no surprise triggered.");
            }
        }

        // 2. Render the scene
        this.render(node);
    }

    async makeChoice(option) {
        console.log("👉 Button clicked: navigating to", option.nextScene);

        // 1. Handle Item FIRST (Data Update)
        if (option.item) {
            const added = this.player.addItem(option.item);
            if (added) {
                console.log(`🎒 Picked up: ${option.item}`);
                this.renderHUD(); // Update UI immediately after successful add
            } else {
                return; // Stop if inventory full
            }
        }

        // 2. Handle Energy
        if (option.energyCost > 0) {
            this.player.modifyEnergy(-option.energyCost);
            this.renderHUD(); // Update UI after energy change
        }

        // 3. Load story file if needed
        if (option.storyFile) {
            await this.loadStoryFile(option.storyFile);
        }

        // 4. Transition
        if (option.triggerMiniGame) {
            this.miniGameEngine.start(option.triggerMiniGame, 1, (isSuccess) => {
                const nextScene = isSuccess ? option.nextScene : (option.failScene || "chamber_dungeon");
                this.handleSceneTransition(nextScene);
            });
        } else {
            this.handleSceneTransition(option.nextScene);
        }
    }

    jumpToScene(sceneId) {
        console.log("🚀 Jumping to:", sceneId);
        
        // Force hide modals before jumping
        document.getElementById('minigame-modal').style.display = 'none';
        
        // Use a tiny delay to allow the browser to repaint
        setTimeout(() => {
            this.handleSceneTransition(sceneId);
        }, 100);
    }

    saveGame() { localStorage.setItem('adventure_game_save', JSON.stringify(this.state)); }

    loadGame() {
        const savedProgress = localStorage.getItem('adventure_game_save');
        if (savedProgress) {
            try { this.state = JSON.parse(savedProgress); } catch (e) { this.resetGame(); }
        }
    }
    
    renderHUD() {
        // Update Energy
        const energyVal = document.getElementById('energy-val');
        if (energyVal) energyVal.innerText = this.player.energy;

        // Update inventory - Single Source of Truth
        const invList = document.getElementById('inventory-list');
        if (invList) {
            // We use the player's internal inventory array directly
            invList.innerHTML = this.player.inventory
                .map(item => `<li>${item}</li>`)
                .join('');
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
        this.timer = null;
        this.isGameActive = false;

        // FIX: Ensure puzzleRegistry is attached to the instance using 'this.'
        this.puzzleRegistry = {
            "sequence_lock": () => this.initRunePuzzle(),
            "trivia_quiz": () => this.initTriviaPuzzle(),
            "dot_tap": () => this.initDotTapPuzzle()
        };
    }

    start(gameId, difficultyTier, onComplete) {        
        this.onComplete = onComplete;
        this.isGameActive = true;
        this.currentPuzzle = null;
        this.playerSequence = [];
        if (this.timer) clearInterval(this.timer);

        // 2. Validate
        if (!this.game.miniGamePool) return;
        const puzzleData = this.game.miniGamePool.find(g => g.id === gameId);
        if (!puzzleData) {
            console.error(`mini-game with ID "${gameId}" not found.`);
            return;
        }

        // 3. Mapping
        this.currentPuzzle = { ...puzzleData };
        const dotMap = { 1: 3, 2: 5, 3: 7 };
        this.currentPuzzle.level = dotMap[difficultyTier] || 3;

        console.log(`🎮 Engine: Starting ${gameId}. Type: ${this.currentPuzzle.type}`);

        // 4. UI Setup
        document.getElementById('minigame-modal').style.display = 'flex';
        document.getElementById('minigame-header').innerText = this.currentPuzzle.title;
        
        const duration = this.currentPuzzle.timeLimit || 10;
        this.startTimer(duration);

        // 5. ROUTER: Correctly using 'this.puzzleRegistry'
        if (this.puzzleRegistry[this.currentPuzzle.type]) {
            this.puzzleRegistry[this.currentPuzzle.type]();
        } else {
            console.error(`Unknown puzzle type: ${this.currentPuzzle.type}`);
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
        // 1. Pick a random question from the pool
        const questions = this.currentPuzzle.questions;
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
        
        // 2. Save this question to the instance so we can check it later
        this.activeQuestion = randomQuestion;
        
        // 3. Update the UI
        document.getElementById('minigame-clue').innerText = this.activeQuestion.clue;
        
        const choicesContainer = document.getElementById('minigame-buttons');
        choicesContainer.innerHTML = '';
        
        this.activeQuestion.choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.innerText = choice;
            btn.className = 'trivia-btn';
            btn.addEventListener('click', () => this.checkTriviaAnswer(choice));
            choicesContainer.appendChild(btn);
        });
    }

    checkTriviaAnswer(selectedAnswer) {
        if (selectedAnswer === this.activeQuestion.answer) {
            this.endMiniGame(true); // Success logic
        } else {
            this.endMiniGame(false); // Fail logic
        }
    }

    // ==========================================
    // MODULE 3: SPEED TAPPING
    // ==========================================
    
   initDotTapPuzzle() {
        const numDots = this.currentPuzzle.level; 
        const buttonsContainer = document.getElementById('minigame-buttons');
        buttonsContainer.innerHTML = '';
        
        const gridSize = Math.ceil(Math.sqrt(numDots));
        const step = 70 / (gridSize - 1 || 1);
        
        const slots = [];
        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                slots.push({ top: 15 + (r * step), left: 15 + (c * step) });
            }
        }
        slots.sort(() => Math.random() - 0.5);

        const sequence = Array.from({ length: numDots }, (_, i) => i + 1);
        
        sequence.forEach((num, index) => {
            const btn = document.createElement('button');
            btn.innerText = num;
            btn.className = 'dot-btn';
            
            // --- RANDOM SIZE LOGIC ---
            // Random size between 40px and 70px
            const randomSize = Math.floor(Math.random() * 30) + 40;
            btn.style.width = `${randomSize}px`;
            btn.style.height = `${randomSize}px`;
            btn.style.fontSize = `${randomSize * 0.4}px`; // Scale font with button
            // -------------------------

            const slot = slots[index];
            btn.style.position = 'absolute';
            btn.style.top = `${slot.top}%`;
            btn.style.left = `${slot.left}%`;
            
            btn.addEventListener('click', () => this.handleDotTap(num, btn));
            buttonsContainer.appendChild(btn);
        });
    }

    handleDotTap(num, btn) {
        const nextExpected = this.playerSequence.length + 1;
        
        if (num === nextExpected) {
            btn.style.backgroundColor = '#10b981';
            btn.disabled = true;
            this.playerSequence.push(num);
            
            // Use the level property instead of hardcoding a sequence length
            if (this.playerSequence.length === this.currentPuzzle.level) {
                this.endMiniGame(true);
            }
        } else {
            this.endMiniGame(false);
        }
    }

    /**
     * Clean Closing Sequence with Scenario Branching
     */
    endMiniGame(isCorrect) {
        if (!this.isGameActive) return;
        this.isGameActive = false;
        clearInterval(this.timer);  

        // Determine outcome destination
        if (this.onComplete) {
            this.onComplete(isCorrect);
        }

        document.getElementById('minigame-modal').style.display = 'none';
    }
}

class Player {
    constructor(name) {
        this.name = name;
        this.inventory = [];
        this.maxInventoryCount = 3;
    }


    // Logic for items
    addItem(item) {
    if (this.inventory.length >= this.maxInventoryCount) {
            console.warn("🎒 Backpack is full!");
            alert("Your backpack is too full to carry anything else!"); 
            return false; // Return false so the game knows it failed
        }
        this.inventory.push(item);
        console.log(`${item} added to pack.`);
        return true; // Return true on success
    }

    // Encapsulated death check
    handleLose() {
        console.log("The journey ends here...");
        // Trigger game over logic
    }
}
// Global initialization hook
const game = new AdventureGame();
window.onload = () => game.initGame();