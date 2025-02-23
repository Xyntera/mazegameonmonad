// Wait for DOM and libraries to load
document.addEventListener('DOMContentLoaded', () => {
    // Check if Three.js and Cannon.js are loaded
    if (typeof THREE === 'undefined' || typeof CANNON === 'undefined') {
        console.error('Three.js or Cannon.js not loaded. Please check external scripts.');
        alert('Error: Required 3D libraries are not loading. Ensure you have an internet connection and the scripts are accessible.');
        return;
    }

    // Game State
    const game = {
        elements: {
            intro: document.getElementById('intro'),
            container: document.getElementById('game-container'),
            canvas: document.getElementById('three-canvas'),
            score: document.getElementById('score-value'),
            time: document.getElementById('time-value'),
            overlay: document.getElementById('overlay'),
            message: document.getElementById('message'),
            restartBtn: document.getElementById('restart-btn'),
            startBtn: document.getElementById('start-btn'),
            clapSound: document.getElementById('clap-sound'),
            stepSound: document.getElementById('step-sound'),
        },
        state: {
            score: 0,
            time: 0,
            mazeSize: 21,
            playerPosition: { x: 1, y: 0, z: 1 },
            goalPosition: { x: 19, y: 0, z: 19 },
            maze: [],
            isPlaying: false,
            camera: null,
            scene: null,
            renderer: null,
            physicsWorld: null,
            mascotBody: null,
            mascotMesh: null,
        },
        seed: Date.now(),
    };

    // Seeded Random Function
    function seededRandom() {
        const x = Math.sin(game.seed++) * 10000;
        return x - Math.floor(x);
    }

    // Initialize Three.js and Cannon.js
    function init3D() {
        const { canvas } = game.elements;
        const { mazeSize } = game.state;

        if (!canvas) {
            console.error('Canvas element not found');
            alert('Error: Canvas not found. Please check the HTML.');
            return;
        }

        // Check WebGL availability
        if (!THREE.WebGL.isWebGLAvailable()) {
            game.elements.message.textContent = 'WebGL is not supported in your browser. Please use a modern browser like Chrome, Firefox, or Safari.';
            game.elements.overlay.classList.add('active');
            return;
        }

        // Scene
        game.state.scene = new THREE.Scene();
        game.state.scene.background = new THREE.Color(0x2e1a5a);

        // Camera (First-person perspective)
        game.state.camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
        game.state.camera.position.set(1.5, 1.5, 1.5);

        // Renderer
        game.state.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        game.state.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        game.state.renderer.setPixelRatio(window.devicePixelRatio || 1); // Mobile compatibility

        // Physics World (CANNON.js)
        game.state.physicsWorld = new CANNON.World();
        game.state.physicsWorld.gravity.set(0, -9.82, 0);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        game.state.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(5, 10, 5);
        game.state.scene.add(directionalLight);

        // Generate 3D Maze
        generate3DMaze();
        createMascot();
        createGoal();

        // Handle window resize
        window.addEventListener('resize', onWindowResize);

        // Start timer (5-minute limit)
        game.state.timer = setInterval(updateTimer, 1000);
    }

    // Generate 3D Maze (Procedural with Prim's Algorithm)
    function generate3DMaze() {
        const { mazeSize, maze } = game.state;
        maze.length = 0;
        for (let z = 0; z < mazeSize; z++) {
            maze[z] = [];
            for (let y = 0; y < 2; y++) {
                maze[z][y] = Array(mazeSize).fill(1); // 1 = wall, 0 = path
            }
        }

        const walls = [];
        const startX = 1, startY = 0, startZ = 1;
        maze[startZ][startY][startX] = 0;

        const directions = [[0, 0, 2], [0, 0, -2], [2, 0, 0], [-2, 0, 0], [0, 2, 0], [0, -2, 0]];
        directions.forEach(([dx, dy, dz]) => {
            const wx = startX + dx, wy = startY + dy, wz = startZ + dz;
            if (wx >= 0 && wx < mazeSize && wy >= 0 && wy < 2 && wz >= 0 && wz < mazeSize) {
                walls.push([wx, wy, wz]);
            }
        });

        while (walls.length > 0) {
            const idx = Math.floor(seededRandom() * walls.length);
            const [wx, wy, wz] = walls[idx];

            const neighbors = directions
                .map(([dx, dy, dz]) => [wx + dx, wy + dy, wz + dz])
                .filter(([nx, ny, nz]) => 
                    nx >= 0 && nx < mazeSize && ny >= 0 && ny < 2 && nz >= 0 && nz < mazeSize && maze[nz][ny][nx] === 0
                );

            if (neighbors.length) {
                const [nx, ny, nz] = neighbors[Math.floor(seededRandom() * neighbors.length)];
                const cx = (wx + nx) / 2, cy = (wy + ny) / 2, cz = (wz + nz) / 2;
                maze[Math.round(wz)][Math.round(wy)][Math.round(wx)] = 0;
                maze[Math.round(cz)][Math.round(cy)][Math.round(cx)] = 0;

                directions.forEach(([dx, dy, dz]) => {
                    const newWx = wx + dx, newWy = wy + dy, newWz = wz + dz;
                    if (
                        newWx >= 0 && newWx < mazeSize && newWy >= 0 && newWy < 2 && newWz >= 0 && newWz < mazeSize &&
                        maze[newWz][newWy][newWx] === 1 &&
                        !walls.some(([x, y, z]) => x === newWx && y === newWy && z === newWz)
                    ) {
                        walls.push([newWx, newWy, newWz]);
                    }
                });
            }
            walls.splice(idx, 1);
        }

        maze[mazeSize - 2][0][mazeSize - 2] = 0; // Goal position
        render3DMaze();
    }

    // Render 3D Maze
    function render3DMaze() {
        const { scene, mazeSize } = game.state;
        const tileSize = 1;

        scene.children.forEach(child => {
            if (child.userData.isMaze) scene.remove(child);
        });

        for (let z = 0; z < mazeSize; z++) {
            for (let y = 0; y < 2; y++) {
                for (let x = 0; x < mazeSize; x++) {
                    if (game.state.maze[z][y][x] === 1) {
                        const geometry = new THREE.BoxGeometry(tileSize, tileSize, tileSize);
                        const material = new THREE.MeshPhongMaterial({ color: 0x4a1f8c, flatShading: true });
                        const wall = new THREE.Mesh(geometry, material);
                        wall.position.set(x * tileSize, y * tileSize, z * tileSize);
                        wall.userData.isMaze = true;
                        scene.add(wall);

                        const wallBody = new CANNON.Body({ mass: 0 });
                        wallBody.addShape(new CANNON.Box(new CANNON.Vec3(tileSize / 2, tileSize / 2, tileSize / 2)));
                        wallBody.position.set(x * tileSize, y * tileSize, z * tileSize);
                        game.state.physicsWorld.addBody(wallBody);
                    }
                }
            }
        }

        const floorGeometry = new THREE.PlaneGeometry(mazeSize * tileSize, mazeSize * tileSize);
        const floorMaterial = new THREE.MeshPhongMaterial({ color: 0x5b2d9e, flatShading: true });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(mazeSize / 2 * tileSize, 0, mazeSize / 2 * tileSize);
        floor.userData.isMaze = true;
        scene.add(floor);

        updatePlayer();
        updateGoal();
    }

    // Create Monad Mascot (Player - Purple Spiky Creature)
    function createMascot() {
        const { scene } = game.state;
        const geometry = new THREE.SphereGeometry(0.4, 16, 16); // Simplified spiky sphere for mascot
        const material = new THREE.MeshPhongMaterial({ 
            color: 0x7b3d8c, // Light purple
            specular: 0x9b4ec5, // Neon purple highlight
            flatShading: true 
        });
        const mascot = new THREE.Mesh(geometry, material);
        mascot.position.copy(game.state.playerPosition);
        mascot.userData.isPlayer = true;
        scene.add(mascot);

        const mascotBody = new CANNON.Body({ mass: 1 });
        mascotBody.addShape(new CANNON.Sphere(0.4));
        mascotBody.position.copy(game.state.playerPosition);
        game.state.physicsWorld.addBody(mascotBody);
        game.state.mascotBody = mascotBody;
        game.state.mascotMesh = mascot;
    }

    // Create Monad House (Goal)
    function createGoal() {
        const { scene } = game.state;
        const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
        const material = new THREE.MeshPhongMaterial({ color: 0x9c2535, flatShading: true });
        const goal = new THREE.Mesh(geometry, material);
        goal.position.copy(game.state.goalPosition);
        goal.userData.isGoal = true;
        scene.add(goal);

        const goalBody = new CANNON.Body({ mass: 0 });
        goalBody.addShape(new CANNON.Box(new CANNON.Vec3(0.4, 0.4, 0.4)));
        goalBody.position.copy(game.state.goalPosition);
        game.state.physicsWorld.addBody(goalBody);
    }

    // Update Player Position
    function updatePlayer() {
        const { mascotMesh, mascotBody, camera } = game.state;
        if (!mascotMesh || !mascotBody || !camera) return;
        mascotMesh.position.copy(mascotBody.position);
        camera.position.set(
            mascotBody.position.x + 1.5,
            mascotBody.position.y + 1.5,
            mascotBody.position.z + 1.5
        );
        camera.lookAt(mascotBody.position);
        playStepSound();
    }

    // Update Goal Position
    function updateGoal() {
        const { goal } = game.state;
        if (!goal) return;
        goal.position.copy(game.state.goalPosition);
    }

    // Handle Window Resize
    function onWindowResize() {
        const { canvas, renderer, camera } = game.state;
        if (!canvas || !renderer || !camera) return;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }

    // Move Player (First-person controls with sound)
    function movePlayer(event) {
        if (!game.state.isPlaying) return;

        const { mascotBody } = game.state;
        if (!mascotBody) return;
        const speed = 0.1;
        const rotationSpeed = 0.05;

        switch (event.key) {
            case 'ArrowUp': case 'w':
                mascotBody.velocity.set(0, 0, -speed);
                break;
            case 'ArrowDown': case 's':
                mascotBody.velocity.set(0, 0, speed);
                break;
            case 'ArrowLeft': case 'a':
                mascotBody.angularVelocity.set(0, -rotationSpeed, 0);
                break;
            case 'ArrowRight': case 'd':
                mascotBody.angularVelocity.set(0, rotationSpeed, 0);
                break;
        }

        checkCollision();
    }

    // Play Footstep Sound
    function playStepSound() {
        const { stepSound } = game.elements;
        if (!stepSound) return;
        if (!stepSound.paused) stepSound.pause();
        stepSound.currentTime = 0;
        stepSound.play().catch(err => console.log('Step sound failed:', err));
    }

    // Check Collision with Walls and Goal
    function checkCollision() {
        const { mascotBody, physicsWorld, goalPosition } = game.state;
        if (!physicsWorld || !mascotBody) return;
        physicsWorld.step(1 / 60);

        const distToGoal = mascotBody.position.distanceTo(new CANNON.Vec3(...Object.values(goalPosition)));
        if (distToGoal < 0.8) {
            endGame(true);
        }
    }

    // Update Timer
    function updateTimer() {
        if (!game.state.isPlaying) return;
        game.state.time++;
        const minutes = Math.floor(game.state.time / 60);
        const seconds = game.state.time % 60;
        game.elements.time.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        if (game.state.time >= 300) { // 5-minute limit
            endGame(false);
        }
    }

    // End Game (Win or Lose)
    function endGame(won) {
        clearInterval(game.state.timer);
        game.state.isPlaying = false;
        game.elements.overlay.classList.add('active');
        game.elements.message.textContent = won ? 'Victory! You reached the Monad House!' : 'Game Over! Time\'s Up!';
        game.elements.restartBtn.focus();
        if (won) {
            celebrate();
        }
    }

    // Celebrate Victory (Mascot Animation)
    function celebrate() {
        const { clapSound } = game.elements;
        if (!clapSound) return;
        clapSound.play().catch(err => console.log('Clap sound failed:', err));

        const { mascotMesh } = game.state;
        if (!mascotMesh) return;
        let scale = 1;
        let rotation = 0;
        const animateLoop = () => {
            if (scale < 1.2) {
                scale += 0.05;
                rotation += 10;
                mascotMesh.scale.set(scale, scale, scale);
                mascotMesh.rotation.y += THREE.MathUtils.degToRad(rotation);
                requestAnimationFrame(animateLoop);
            } else {
                setTimeout(() => {
                    resetMascot();
                    resetGame();
                }, 1000);
            }
        };
        animateLoop();
    }

    // Reset Mascot Position and Animation
    function resetMascot() {
        const { mascotMesh, mascotBody } = game.state;
        if (!mascotMesh || !mascotBody) return;
        mascotMesh.scale.set(1, 1, 1);
        mascotMesh.rotation.set(0, 0, 0);
        mascotBody.position.copy(game.state.playerPosition);
        mascotBody.velocity.set(0, 0, 0);
        mascotBody.angularVelocity.set(0, 0, 0);
    }

    // Reset Game
    function resetGame() {
        game.state.score = 0;
        game.state.time = 0;
        game.elements.score.textContent = game.state.score;
        game.elements.time.textContent = '00:00';
        game.state.playerPosition = { x: 1, y: 0, z: 1 };
        game.state.goalPosition = { x: 19, y: 0, z: 19 };
        resetMascot();
        game.elements.overlay.classList.remove('active');
        generate3DMaze();
        game.state.isPlaying = true;
        game.state.timer = setInterval(updateTimer, 1000);
    }

    // Start Game
    function startGame() {
        game.elements.intro.classList.add('hidden');
        game.state.isPlaying = true;
        init3D();
        animate();
        document.addEventListener('keydown', movePlayer);
    }

    // Animate Scene
    function animate() {
        if (!game.state.isPlaying) return;

        requestAnimationFrame(animate);
        game.state.physicsWorld.step(1 / 60);
        updatePlayer();
        game.state.renderer.render(game.state.scene, game.state.camera);
    }

    // Event Listeners
    game.elements.startBtn.addEventListener('click', startGame);
    game.elements.restartBtn.addEventListener('click', resetGame);

    document.addEventListener('keydown', (e) => {
        if (!game.state.isPlaying && !game.elements.intro.classList.contains('hidden')) {
            startGame();
        }
    });

    window.addEventListener('resize', onWindowResize);

    // Initial Setup
    game.elements.score.textContent = game.state.score;
    game.elements.time.textContent = '00:00';
});
