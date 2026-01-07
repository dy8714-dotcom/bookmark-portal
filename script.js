console.log('=== script.js 読み込み開始 ===');

// 認証マネージャー
class AuthManager {
    constructor() {
        this.currentUser = null;
    }

    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    generateUserId(username) {
        return 'user_' + username.toLowerCase().replace(/[^a-z0-9]/g, '_');
    }

    async register(username, password) {
        if (!username || !password) {
            throw new Error('ユーザー名とパスワードを入力してください');
        }
        if (username.length < 3) {
            throw new Error('ユーザー名は3文字以上で入力してください');
        }
        if (password.length < 4) {
            throw new Error('パスワードは4文字以上で入力してください');
        }

        const userId = this.generateUserId(username);
        const passwordHash = await this.hashPassword(password);

        if (window.firebaseDB) {
            const userDoc = window.firebaseDoc(window.firebaseDB, 'users', userId);
            const docSnap = await window.firebaseGetDoc(userDoc);
            if (docSnap.exists()) {
                throw new Error('このユーザー名は既に使用されています');
            }
            await window.firebaseSetDoc(userDoc, {
                username: username,
                passwordHash: passwordHash,
                createdAt: Date.now()
            });
        }

        localStorage.setItem('currentUser', username);
        localStorage.setItem('userId', userId);
        this.currentUser = username;
        return userId;
    }

    async login(username, password) {
        if (!username || !password) {
            throw new Error('ユーザー名とパスワードを入力してください');
        }

        const userId = this.generateUserId(username);
        const passwordHash = await this.hashPassword(password);

        if (window.firebaseDB) {
            const userDoc = window.firebaseDoc(window.firebaseDB, 'users', userId);
            const docSnap = await window.firebaseGetDoc(userDoc);
            if (!docSnap.exists()) {
                throw new Error('ユーザー名またはパスワードが正しくありません');
            }
            const userData = docSnap.data();
            if (userData.passwordHash !== passwordHash) {
                throw new Error('ユーザー名またはパスワードが正しくありません');
            }
        }

        localStorage.setItem('currentUser', username);
        localStorage.setItem('userId', userId);
        this.currentUser = username;
        return userId;
    }

    logout() {
        localStorage.removeItem('currentUser');
        this.currentUser = null;
    }

    isLoggedIn() {
        const user = localStorage.getItem('currentUser');
        if (user) {
            this.currentUser = user;
            return true;
        }
        return false;
    }

    getCurrentUser() {
        return this.currentUser || localStorage.getItem('currentUser');
    }

    getUserId() {
        return localStorage.getItem('userId');
    }
}

// ブックマークマネージャー（シンプル版）
class BookmarkManager {
    constructor() {
        this.data = this.loadData();
    }

    loadData() {
        try {
            const userId = localStorage.getItem('userId');
            const dataStr = localStorage.getItem(`bookmarkData_${userId}`);
            if (dataStr) {
                return JSON.parse(dataStr);
            }
        } catch (error) {
            console.error('データ読み込みエラー:', error);
        }
        return this.getDefaultData();
    }

    getDefaultData() {
        return {
            categories: [
                {
                    id: this.generateId(),
                    name: '趣味',
                    color: '#4CAF50',
                    bookmarks: [
                        { id: this.generateId(), name: 'YouTube', url: 'https://www.youtube.com', description: '動画共有サイト' },
                        { id: this.generateId(), name: 'Netflix', url: 'https://www.netflix.com', description: '動画ストリーミング' }
                    ]
                },
                {
                    id: this.generateId(),
                    name: 'プライベート',
                    color: '#2196F3',
                    bookmarks: [
                        { id: this.generateId(), name: 'Gmail', url: 'https://mail.google.com', description: 'メール' }
                    ]
                }
            ]
        };
    }

    saveData() {
        try {
            const userId = localStorage.getItem('userId');
            localStorage.setItem(`bookmarkData_${userId}`, JSON.stringify(this.data));
        } catch (error) {
            console.error('データ保存エラー:', error);
        }
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    addCategory(name, color) {
        const category = {
            id: this.generateId(),
            name: name,
            color: color,
            bookmarks: []
        };
        this.data.categories.push(category);
        this.saveData();
        return category;
    }

    updateCategory(id, name, color) {
        const category = this.data.categories.find(c => c.id === id);
        if (category) {
            category.name = name;
            category.color = color;
            this.saveData();
        }
    }

    deleteCategory(id) {
        this.data.categories = this.data.categories.filter(c => c.id !== id);
        this.saveData();
    }

    addBookmark(categoryId, name, url, description) {
        const category = this.data.categories.find(c => c.id === categoryId);
        if (category) {
            const bookmark = {
                id: this.generateId(),
                name: name,
                url: url,
                description: description || ''
            };
            category.bookmarks.push(bookmark);
            this.saveData();
            return bookmark;
        }
    }

    updateBookmark(categoryId, bookmarkId, name, url, description) {
        const category = this.data.categories.find(c => c.id === categoryId);
        if (category) {
            const bookmark = category.bookmarks.find(b => b.id === bookmarkId);
            if (bookmark) {
                bookmark.name = name;
                bookmark.url = url;
                bookmark.description = description || '';
                this.saveData();
            }
        }
    }

    deleteBookmark(categoryId, bookmarkId) {
        const category = this.data.categories.find(c => c.id === categoryId);
        if (category) {
            category.bookmarks = category.bookmarks.filter(b => b.id !== bookmarkId);
            this.saveData();
        }
    }

    exportData() {
        const dataStr = JSON.stringify(this.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bookmarks-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importData(jsonStr) {
        try {
            const imported = JSON.parse(jsonStr);
            if (imported.categories && Array.isArray(imported.categories)) {
                this.data = imported;
                this.saveData();
                return true;
            }
        } catch (error) {
            console.error('インポートエラー:', error);
        }
        return false;
    }
}

// UIマネージャー（シンプル版）
class UIManager {
    constructor(bookmarkManager) {
        this.manager = bookmarkManager;
        this.currentCategoryId = null;
        this.currentBookmarkId = null;
        this.init();
    }

    init() {
        this.renderCategories();
        this.updateStats();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // カテゴリー追加
        document.getElementById('addCategoryBtn').addEventListener('click', () => {
            this.showCategoryModal();
        });

        // カテゴリーモーダル
        document.getElementById('saveCategoryBtn').addEventListener('click', () => {
            this.saveCategory();
        });

        document.querySelectorAll('#categoryModal .close, #categoryModal .cancel').forEach(el => {
            el.addEventListener('click', () => this.closeCategoryModal());
        });

        // ブックマークモーダル
        document.getElementById('saveBookmarkBtn').addEventListener('click', () => {
            this.saveBookmark();
        });

        document.querySelectorAll('#bookmarkModal .close, #bookmarkModal .cancel').forEach(el => {
            el.addEventListener('click', () => this.closeBookmarkModal());
        });

        // エクスポート
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.manager.exportData();
        });

        // インポート
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importModal').classList.add('active');
        });

        document.getElementById('confirmImportBtn').addEventListener('click', () => {
            this.importFile();
        });

        document.querySelectorAll('#importModal .close, #importModal .cancel').forEach(el => {
            el.addEventListener('click', () => {
                document.getElementById('importModal').classList.remove('active');
            });
        });
    }

    renderCategories() {
        const container = document.getElementById('mainContent');
        container.innerHTML = '';

        if (this.manager.data.categories.length === 0) {
            container.innerHTML = '<div class="no-categories">カテゴリーがありません</div>';
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'categories-grid';

        this.manager.data.categories.forEach(category => {
            const card = this.createCategoryCard(category);
            grid.appendChild(card);
        });

        container.appendChild(grid);
    }

    createCategoryCard(category) {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.innerHTML = `
            <div class="category-header" style="background-color: ${category.color}">
                <h3>${this.escapeHtml(category.name)}</h3>
                <div class="category-actions">
                    <button class="btn-add" data-category-id="${category.id}">➕</button>
                    <button class="btn-edit" data-category-id="${category.id}">✏️</button>
                    <button class="btn-delete" data-category-id="${category.id}">🗑️</button>
                </div>
            </div>
            <div class="category-body">
                ${category.bookmarks.map(b => `
                    <div class="bookmark-item">
                        <a href="${this.escapeHtml(b.url)}" target="_blank">${this.escapeHtml(b.name)}</a>
                        <div class="bookmark-actions">
                            <button class="btn-copy" data-url="${this.escapeHtml(b.url)}">📋</button>
                            <button class="btn-edit-bookmark" data-category-id="${category.id}" data-bookmark-id="${b.id}">✏️</button>
                            <button class="btn-delete-bookmark" data-category-id="${category.id}" data-bookmark-id="${b.id}">🗑️</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        // イベントリスナー
        card.querySelector('.btn-add').addEventListener('click', () => {
            this.showBookmarkModal(category.id);
        });

        card.querySelector('.btn-edit').addEventListener('click', () => {
            this.showCategoryModal(category.id);
        });

        card.querySelector('.btn-delete').addEventListener('click', () => {
            if (confirm(`カテゴリー「${category.name}」を削除しますか？`)) {
                this.manager.deleteCategory(category.id);
                this.renderCategories();
                this.updateStats();
            }
        });

        card.querySelectorAll('.btn-copy').forEach(btn => {
            btn.addEventListener('click', () => {
                navigator.clipboard.writeText(btn.dataset.url);
                alert('URLをコピーしました！');
            });
        });

        card.querySelectorAll('.btn-edit-bookmark').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showBookmarkModal(btn.dataset.categoryId, btn.dataset.bookmarkId);
            });
        });

        card.querySelectorAll('.btn-delete-bookmark').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('このブックマークを削除しますか？')) {
                    this.manager.deleteBookmark(btn.dataset.categoryId, btn.dataset.bookmarkId);
                    this.renderCategories();
                    this.updateStats();
                }
            });
        });

        return card;
    }

    showCategoryModal(categoryId = null) {
        const modal = document.getElementById('categoryModal');
        const nameInput = document.getElementById('categoryNameInput');
        const colorInput = document.getElementById('categoryColorInput');

        if (categoryId) {
            const category = this.manager.data.categories.find(c => c.id === categoryId);
            nameInput.value = category.name;
            colorInput.value = category.color;
            this.currentCategoryId = categoryId;
        } else {
            nameInput.value = '';
            colorInput.value = '#4CAF50';
            this.currentCategoryId = null;
        }

        modal.classList.add('active');
    }

    closeCategoryModal() {
        document.getElementById('categoryModal').classList.remove('active');
        this.currentCategoryId = null;
    }

    saveCategory() {
        const name = document.getElementById('categoryNameInput').value.trim();
        const color = document.getElementById('categoryColorInput').value;

        if (!name) {
            alert('カテゴリー名を入力してください');
            return;
        }

        if (this.currentCategoryId) {
            this.manager.updateCategory(this.currentCategoryId, name, color);
        } else {
            this.manager.addCategory(name, color);
        }

        this.closeCategoryModal();
        this.renderCategories();
        this.updateStats();
    }

    showBookmarkModal(categoryId, bookmarkId = null) {
        const modal = document.getElementById('bookmarkModal');
        const nameInput = document.getElementById('bookmarkNameInput');
        const urlInput = document.getElementById('bookmarkUrlInput');
        const descInput = document.getElementById('bookmarkDescInput');

        this.currentCategoryId = categoryId;

        if (bookmarkId) {
            const category = this.manager.data.categories.find(c => c.id === categoryId);
            const bookmark = category.bookmarks.find(b => b.id === bookmarkId);
            nameInput.value = bookmark.name;
            urlInput.value = bookmark.url;
            descInput.value = bookmark.description;
            this.currentBookmarkId = bookmarkId;
        } else {
            nameInput.value = '';
            urlInput.value = '';
            descInput.value = '';
            this.currentBookmarkId = null;
        }

        modal.classList.add('active');
    }

    closeBookmarkModal() {
        document.getElementById('bookmarkModal').classList.remove('active');
        this.currentCategoryId = null;
        this.currentBookmarkId = null;
    }

    saveBookmark() {
        const name = document.getElementById('bookmarkNameInput').value.trim();
        const url = document.getElementById('bookmarkUrlInput').value.trim();
        const description = document.getElementById('bookmarkDescInput').value.trim();

        if (!name || !url) {
            alert('名前とURLは必須です');
            return;
        }

        if (this.currentBookmarkId) {
            this.manager.updateBookmark(this.currentCategoryId, this.currentBookmarkId, name, url, description);
        } else {
            this.manager.addBookmark(this.currentCategoryId, name, url, description);
        }

        this.closeBookmarkModal();
        this.renderCategories();
        this.updateStats();
    }

    importFile() {
        const fileInput = document.getElementById('importFileInput');
        const file = fileInput.files[0];

        if (!file) {
            alert('ファイルを選択してください');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            if (this.manager.importData(e.target.result)) {
                document.getElementById('importModal').classList.remove('active');
                this.renderCategories();
                this.updateStats();
                alert('インポートが完了しました！');
            } else {
                alert('インポートに失敗しました');
            }
        };
        reader.readAsText(file);
    }

    updateStats() {
        const categoryCount = this.manager.data.categories.length;
        const bookmarkCount = this.manager.data.categories.reduce((sum, c) => sum + c.bookmarks.length, 0);
        document.getElementById('categoryCount').textContent = categoryCount;
        document.getElementById('bookmarkCount').textContent = bookmarkCount;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// アプリ初期化
console.log('=== アプリ初期化開始 ===');

function waitForFirebase() {
    return new Promise((resolve) => {
        const check = () => {
            if (window.firebaseDB) {
                console.log('Firebase準備完了');
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

async function initApp() {
    await waitForFirebase();
    
    const authManager = new AuthManager();
    
    if (!authManager.isLoggedIn()) {
        showLoginScreen(authManager);
    } else {
        showMainApp(authManager);
    }
}

function showLoginScreen(authManager) {
    console.log('ログイン画面表示');
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';

    document.getElementById('showRegister').addEventListener('click', () => {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    });

    document.getElementById('showLogin').addEventListener('click', () => {
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
    });

    document.getElementById('loginBtn').addEventListener('click', async () => {
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        try {
            await authManager.login(username, password);
            location.reload();
        } catch (error) {
            alert(error.message);
        }
    });

    document.getElementById('registerBtn').addEventListener('click', async () => {
        const username = document.getElementById('registerUsername').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;

        if (password !== confirmPassword) {
            alert('パスワードが一致しません');
            return;
        }

        try {
            await authManager.register(username, password);
            location.reload();
        } catch (error) {
            alert(error.message);
        }
    });
}

function showMainApp(authManager) {
    console.log('メインアプリ表示');
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';

    document.getElementById('currentUser').textContent = authManager.getCurrentUser();

    document.getElementById('logoutBtn').addEventListener('click', () => {
        if (confirm('ログアウトしますか？')) {
            authManager.logout();
            location.reload();
        }
    });

    const bookmarkManager = new BookmarkManager();
    const ui = new UIManager(bookmarkManager);
    
    console.log('=== アプリ初期化完了 ===');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
