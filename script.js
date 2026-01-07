// ============================================
// 認証管理
// ============================================
class AuthManager {
    constructor() {
        this.currentUser = localStorage.getItem('currentUser');
    }

    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    getUserId(username) {
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

        const userId = this.getUserId(username);
        const passwordHash = await this.hashPassword(password);

        const userDoc = await window.firebaseGetDoc(window.firebaseDoc(window.firebaseDB, 'users', userId));
        
        if (userDoc.exists()) {
            throw new Error('このユーザー名は既に使用されています');
        }

        await window.firebaseSetDoc(window.firebaseDoc(window.firebaseDB, 'users', userId), {
            username: username,
            passwordHash: passwordHash,
            createdAt: new Date().toISOString()
        });

        localStorage.setItem('currentUser', username);
        localStorage.setItem('userId', userId);
        this.currentUser = username;

        console.log('新規登録成功:', username);
    }

    async login(username, password) {
        if (!username || !password) {
            throw new Error('ユーザー名とパスワードを入力してください');
        }

        const userId = this.getUserId(username);
        const passwordHash = await this.hashPassword(password);

        const userDoc = await window.firebaseGetDoc(window.firebaseDoc(window.firebaseDB, 'users', userId));

        if (!userDoc.exists()) {
            throw new Error('ユーザー名またはパスワードが間違っています');
        }

        const userData = userDoc.data();
        if (userData.passwordHash !== passwordHash) {
            throw new Error('ユーザー名またはパスワードが間違っています');
        }

        localStorage.setItem('currentUser', username);
        localStorage.setItem('userId', userId);
        this.currentUser = username;

        console.log('ログイン成功:', username);
    }

    logout() {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('userId');
        this.currentUser = null;
        console.log('ログアウトしました');
    }

    isLoggedIn() {
        return !!this.currentUser;
    }

    getCurrentUser() {
        return this.currentUser;
    }
}

// ============================================
// ブックマーク管理（同期機能付き）
// ============================================
class BookmarkManager {
    constructor() {
        this.userId = localStorage.getItem('userId');
        this.data = this.loadData() || this.getDefaultData();
        this.saveData();
        console.log('✅ BookmarkManager 初期化完了');
    }

    getDefaultData() {
        return {
            categories: [
                {
                    id: this.generateId(),
                    name: '趣味',
                    color: '#4CAF50',
                    bookmarks: [
                        { id: this.generateId(), name: 'YouTube', url: 'https://www.youtube.com', description: '動画サイト' },
                        { id: this.generateId(), name: 'Netflix', url: 'https://www.netflix.com', description: '映画・ドラマ' }
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

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    loadData() {
        try {
            if (!this.userId) return null;
            
            const saved = localStorage.getItem(`bookmarkData_${this.userId}`);
            return saved ? JSON.parse(saved) : null;
        } catch (error) {
            console.error('データの読み込みに失敗しました:', error);
            return null;
        }
    }

    saveData() {
        try {
            if (!this.userId) return;
            
            localStorage.setItem(`bookmarkData_${this.userId}`, JSON.stringify(this.data));
            console.log('データを保存しました');
        } catch (error) {
            console.error('データの保存に失敗しました:', error);
        }
    }

    async syncToCloud() {
        if (!this.userId) {
            console.log('ユーザーIDがありません');
            return false;
        }

        try {
            this.updateSyncStatus('🔄 同期中...', 'syncing');
            
            const docRef = window.firebaseDoc(window.firebaseDB, 'bookmarks', this.userId);
            await window.firebaseSetDoc(docRef, {
                data: this.data,
                lastSync: new Date().toISOString()
            });

            console.log('✅ クラウドに同期しました');
            this.updateSyncStatus('☁️ 同期済み', 'synced');
            
            setTimeout(() => {
                this.updateSyncStatus('💾 ローカル保存', 'local');
            }, 2000);
            
            return true;
        } catch (error) {
            console.error('❌ 同期エラー:', error);
            this.updateSyncStatus('❌ 同期失敗', 'error');
            return false;
        }
    }

    async loadFromCloud() {
        if (!this.userId) return false;

        try {
            const docRef = window.firebaseDoc(window.firebaseDB, 'bookmarks', this.userId);
            const docSnap = await window.firebaseGetDoc(docRef);

            if (docSnap.exists()) {
                const cloudData = docSnap.data();
                this.data = cloudData.data;
                this.saveData();
                console.log('✅ クラウドからデータを取得しました');
                return true;
            } else {
                console.log('クラウドにデータがありません');
                return false;
            }
        } catch (error) {
            console.error('❌ ダウンロードエラー:', error);
            return false;
        }
    }

    updateSyncStatus(text, status) {
        const statusEl = document.getElementById('syncStatus');
        if (statusEl) {
            statusEl.textContent = text;
            statusEl.className = `sync-status ${status}`;
        }
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
        this.syncToCloud();
        return category;
    }

    updateCategory(categoryId, name, color) {
        const category = this.data.categories.find(c => c.id === categoryId);
        if (category) {
            category.name = name;
            category.color = color;
            this.saveData();
            this.syncToCloud();
        }
    }

    deleteCategory(categoryId) {
        this.data.categories = this.data.categories.filter(c => c.id !== categoryId);
        this.saveData();
        this.syncToCloud();
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
            this.syncToCloud();
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
                this.syncToCloud();
            }
        }
    }

    deleteBookmark(categoryId, bookmarkId) {
        const category = this.data.categories.find(c => c.id === categoryId);
        if (category) {
            category.bookmarks = category.bookmarks.filter(b => b.id !== bookmarkId);
            this.saveData();
            this.syncToCloud();
        }
    }

    exportData() {
        const dataStr = JSON.stringify(this.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `bookmarks_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    importData(data) {
        try {
            if (!Array.isArray(data.categories)) {
                throw new Error('無効なデータ形式です');
            }
            this.data = data;
            this.saveData();
            this.syncToCloud();
            return true;
        } catch (error) {
            console.error('インポートエラー:', error);
            return false;
        }
    }

    getStats() {
        const categoryCount = this.data.categories.length;
        const bookmarkCount = this.data.categories.reduce((sum, cat) => sum + cat.bookmarks.length, 0);
        return { categoryCount, bookmarkCount };
    }
}

// ============================================
// UI管理
// ============================================
class UIManager {
    constructor(bookmarkManager) {
        this.manager = bookmarkManager;
        this.currentCategoryId = null;
        this.currentBookmarkId = null;
        
        console.log('=== UIManager 初期化開始 ===');
        this.init();
        console.log('=== UIManager 初期化完了 ===');
    }

    init() {
        this.renderCategories();
        this.updateStats();
        this.setupEventListeners();
        console.log('イベントリスナー設定完了');
    }

    setupEventListeners() {
        console.log('イベントリスナーを設定中...');

        // カテゴリー追加ボタン
        const addCategoryBtn = document.getElementById('addCategoryBtn');
        if (addCategoryBtn) {
            addCategoryBtn.addEventListener('click', () => {
                console.log('カテゴリー追加ボタンがクリックされました');
                this.showCategoryModal();
            });
            console.log('✅ カテゴリー追加ボタンのリスナー設定完了');
        }

        // 同期ボタン
        const syncBtn = document.getElementById('syncBtn');
        if (syncBtn) {
            syncBtn.addEventListener('click', async () => {
                console.log('同期ボタンがクリックされました');
                await this.manager.syncToCloud();
            });
            console.log('✅ 同期ボタンのリスナー設定完了');
        }

        // カテゴリー保存ボタン
        const saveCategoryBtn = document.getElementById('saveCategoryBtn');
        if (saveCategoryBtn) {
            saveCategoryBtn.addEventListener('click', () => {
                console.log('カテゴリー保存ボタンがクリックされました');
                this.saveCategory();
            });
            console.log('✅ カテゴリー保存ボタンのリスナー設定完了');
        }

        // カテゴリーモーダルを閉じる
        document.querySelectorAll('#categoryModal .close, #categoryModal .cancel').forEach(el => {
            el.addEventListener('click', () => this.closeCategoryModal());
        });

        // ブックマーク保存ボタン
        const saveBookmarkBtn = document.getElementById('saveBookmarkBtn');
        if (saveBookmarkBtn) {
            saveBookmarkBtn.addEventListener('click', () => {
                console.log('ブックマーク保存ボタンがクリックされました');
                this.saveBookmark();
            });
        }

        // ブックマークモーダルを閉じる
        document.querySelectorAll('#bookmarkModal .close, #bookmarkModal .cancel').forEach(el => {
            el.addEventListener('click', () => this.closeBookmarkModal());
        });

        // エクスポートボタン
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                console.log('エクスポートボタンがクリックされました');
                this.manager.exportData();
            });
        }

        // インポートボタン
        const importBtn = document.getElementById('importBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                console.log('インポートボタンがクリックされました');
                document.getElementById('importModal').classList.add('active');
            });
        }

        // インポート実行ボタン
        const confirmImportBtn = document.getElementById('confirmImportBtn');
        if (confirmImportBtn) {
            confirmImportBtn.addEventListener('click', () => {
                this.importFile();
            });
        }

        // インポートモーダルを閉じる
        document.querySelectorAll('#importModal .close, #importModal .cancel').forEach(el => {
            el.addEventListener('click', () => {
                document.getElementById('importModal').classList.remove('active');
            });
        });

        console.log('全イベントリスナー設定完了');
    }

    showCategoryModal(categoryId = null) {
        console.log('カテゴリーモーダルを表示:', categoryId);
        this.currentCategoryId = categoryId;
        
        const modal = document.getElementById('categoryModal');
        const title = document.getElementById('categoryModalTitle');
        const nameInput = document.getElementById('categoryNameInput');
        const colorInput = document.getElementById('categoryColorInput');

        if (categoryId) {
            const category = this.manager.data.categories.find(c => c.id === categoryId);
            if (category) {
                title.textContent = 'カテゴリーを編集';
                nameInput.value = category.name;
                colorInput.value = category.color;
            }
        } else {
            title.textContent = 'カテゴリーを追加';
            nameInput.value = '';
            colorInput.value = '#4CAF50';
        }

        modal.classList.add('active');
        nameInput.focus();
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
        this.currentCategoryId = categoryId;
        this.currentBookmarkId = bookmarkId;

        const modal = document.getElementById('bookmarkModal');
        const title = document.getElementById('bookmarkModalTitle');
        const nameInput = document.getElementById('bookmarkNameInput');
        const urlInput = document.getElementById('bookmarkUrlInput');
        const descInput = document.getElementById('bookmarkDescInput');

        if (bookmarkId) {
            const category = this.manager.data.categories.find(c => c.id === categoryId);
            const bookmark = category?.bookmarks.find(b => b.id === bookmarkId);
            if (bookmark) {
                title.textContent = 'ブックマークを編集';
                nameInput.value = bookmark.name;
                urlInput.value = bookmark.url;
                descInput.value = bookmark.description || '';
            }
        } else {
            title.textContent = 'ブックマークを追加';
            nameInput.value = '';
            urlInput.value = '';
            descInput.value = '';
        }

        modal.classList.add('active');
        nameInput.focus();
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
            alert('サイト名とURLを入力してください');
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

    renderCategories() {
        const container = document.getElementById('mainContent');
        container.innerHTML = '';

        if (this.manager.data.categories.length === 0) {
            container.innerHTML = '<div class="no-categories">カテゴリーがありません。「カテゴリーを追加」ボタンから作成してください。</div>';
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'categories-grid';

        this.manager.data.categories.forEach(category => {
            const card = this.createCategoryCard(category);
            grid.appendChild(card);
        });

        container.appendChild(grid);
        this.attachCategoryEvents();
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
                ${category.bookmarks.length === 0 ? 
                    '<div class="no-bookmarks">ブックマークがありません</div>' :
                    category.bookmarks.map(b => `
                        <div class="bookmark-item">
                            <a href="${this.escapeHtml(b.url)}" target="_blank">${this.escapeHtml(b.name)}</a>
                            <div class="bookmark-actions">
                                <button class="btn-copy" data-url="${this.escapeHtml(b.url)}">📋</button>
                                <button class="btn-edit-bookmark" data-category-id="${category.id}" data-bookmark-id="${b.id}">✏️</button>
                                <button class="btn-delete-bookmark" data-category-id="${category.id}" data-bookmark-id="${b.id}">🗑️</button>
                            </div>
                        </div>
                    `).join('')
                }
            </div>
        `;
        return card;
    }

    attachCategoryEvents() {
        document.querySelectorAll('.btn-add').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const categoryId = e.target.dataset.categoryId;
                this.showBookmarkModal(categoryId);
            });
        });

        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const categoryId = e.target.dataset.categoryId;
                this.showCategoryModal(categoryId);
            });
        });

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const categoryId = e.target.dataset.categoryId;
                if (confirm('このカテゴリーを削除しますか？')) {
                    this.manager.deleteCategory(categoryId);
                    this.renderCategories();
                    this.updateStats();
                }
            });
        });

        document.querySelectorAll('.btn-edit-bookmark').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const categoryId = e.target.dataset.categoryId;
                const bookmarkId = e.target.dataset.bookmarkId;
                this.showBookmarkModal(categoryId, bookmarkId);
            });
        });

        document.querySelectorAll('.btn-delete-bookmark').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const categoryId = e.target.dataset.categoryId;
                const bookmarkId = e.target.dataset.bookmarkId;
                if (confirm('このブックマークを削除しますか？')) {
                    this.manager.deleteBookmark(categoryId, bookmarkId);
                    this.renderCategories();
                    this.updateStats();
                }
            });
        });

        document.querySelectorAll('.btn-copy').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const url = e.target.dataset.url;
                navigator.clipboard.writeText(url).then(() => {
                    alert('URLをコピーしました');
                });
            });
        });
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
            try {
                const data = JSON.parse(e.target.result);
                if (this.manager.importData(data)) {
                    alert('データをインポートしました');
                    document.getElementById('importModal').classList.remove('active');
                    this.renderCategories();
                    this.updateStats();
                } else {
                    alert('データのインポートに失敗しました');
                }
            } catch (error) {
                alert('無効なファイル形式です');
            }
        };
        reader.readAsText(file);
    }

    updateStats() {
        const stats = this.manager.getStats();
        document.getElementById('categoryCount').textContent = stats.categoryCount;
        document.getElementById('bookmarkCount').textContent = stats.bookmarkCount;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ============================================
// アプリ初期化
// ============================================
console.log('=== script.js 読み込み開始 ===');

function initApp() {
    console.log('=== アプリ初期化開始 ===');
    
    const authManager = new AuthManager();

    if (authManager.isLoggedIn()) {
        showMainApp(authManager);
    } else {
        showLoginScreen(authManager);
    }
}

function showLoginScreen(authManager) {
    console.log('ログイン画面表示');
    
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

    // シンプルな同期初期化
    const bookmarkManager = new BookmarkManager();
    const ui = new UIManager(bookmarkManager);
    
    // クラウドから最新データを取得（バックグラウンド）
    bookmarkManager.loadFromCloud().then(loaded => {
        if (loaded) {
            ui.renderCategories();
            ui.updateStats();
        }
    });
    
    // グローバルに公開（デバッグ用）
    window.ui = ui;
    window.bookmarkManager = bookmarkManager;
    
    console.log('=== アプリ初期化完了 ===');
}

// DOMContentLoaded で初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
