const fs = require('fs');

const storyData = JSON.parse(fs.readFileSync('./assets/story_fantasy.json', 'utf8'));

console.log("graph TD");

for (const [key, scene] of Object.entries(storyData)) {
    // 1. Handle regular option-based transitions
    if (scene.options) {
        scene.options.forEach(opt => {
            const label = opt.text.replace(/"/g, "'"); 
            
            if (opt.nextScene) {
                console.log(`    ${key} -->|"${label}"| ${opt.nextScene}`);
            } 
            // Handle miniGame if it exists within an option
            else if (opt.miniGame) {
                const success = opt.miniGame.onSuccess || "Success";
                const fail = opt.miniGame.onFailure || "Fail";
                console.log(`    ${key} -->|"${label} (Success)"| ${success}`);
                console.log(`    ${key} -->|"${label} (Fail)"| ${fail}`);
            }
        });
    }

    // 2. Handle scene-level surprise transitions
    // This is separate so it doesn't get mixed up with the options loop
    if (scene.surprise === true) {
        const miniGame = scene.surpriseMiniGameId || "Surprise";
        const success = scene.onSurpriseSuccess;
        const fail = scene.onSurpriseFailure;

        if (success) {
            console.log(`    ${key} -.->|"${miniGame} (Success)"| ${success}`);
        }
        if (fail) {
            console.log(`    ${key} -.->|"${miniGame} (Fail)"| ${fail}`);
        }
    }
}