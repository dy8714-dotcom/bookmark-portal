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

// Firebase同期マネージャー
class FirebaseSyncManager {
    constructor(bookmarkManager) {
        this.bookmarkManager = bookmarkManager;
        this.isSyncing = false;
        this.unsubscribe = null;
    }

    async enableSync(userId) {
        if (!window.firebaseDB) {
            console.error('Firebase未初期化');
            return false;
        }

        this.isSyncing = true;
        const docRef = window.firebaseDoc(window.firebaseDB, 'bookmarks', userId);

        try {
            const docSnap = await window.firebaseGetDoc(docRef);
            
            if (docSnap.exists()) {
                const cloudData = docSnap.data();
                const localData = this.bookmarkManager.data;
                
                const localTimestamp = localData.lastModified || 0;
                const cloudTimestamp = cloudData.lastModified || 0;
                
                if (cloudTimestamp > localTimestamp) {
                    this.bookmarkManager.data = cloudData;
                    this.bookmarkManager.saveData();
                } else if (localTimestamp > cloudTimestamp) {
                    await window.firebaseSetDoc(docRef, this.bookmarkManager.data);
                }
            } else {
                await window.firebaseSetDoc(docRef, this.bookmarkManager.data);
            }

            this.unsubscribe = window.firebaseOnSnapshot(docRef, (doc) => {
                if (doc.exists()) {
                    const cloudData = doc.data();
                    const localTimestamp = this.bookmarkManager.data.lastModified || 0;
                    const cloudTimestamp = cloudData.lastModified || 0;
                    
                    if (cloudTimestamp > localTimestamp) {
                        this.bookmarkManager.data = cloudData;
                        this.bookmarkManager.saveData();
                        if (window.uiManager) {
                            window.uiManager.renderCategories();
                        }
                    }
                }
            });

            return true;
        } catch (error) {
            console.error('同期エラー:', error);
            return false;
        }
    }

    async syncToCloud(userId) {
        if (!window.firebaseDB || !this.isSyncing) return;

        try {
            const docRef = window.firebaseDoc(window.firebaseDB, 'bookmarks', userId);
            this.bookmarkManager.data.lastModified = Date.now();
            await window.firebaseSetDoc(docRef, this.bookmarkManager.data);
        } catch (error) {
            console.error('クラウドへの保存エラー:', error);
        }
    }

    disableSync() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        this.isSyncing = false;
    }

    isEnabled() {
        return this.isSyncing;
    }
}

// ブックマークマネージャー（タグ機能追加）
class BookmarkManager {
    constructor() {
        this.data = this.loadData();
        
        // タグリストの初期化
        if (!this.data.tags) {
            this.data.tags = [];
        }
    }

    loadData() {
        try {
            const savedData = localStorage.getItem('bookmarkData');
            if (savedData) {
                const data = JSON.parse(savedData);
                // タグリストの初期化
                if (!data.tags) {
                    data.tags = [];
                }
                return data;
            }
        } catch (error) {
            console.error('データの読み込みエラー:', error);
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
                        { id: this.generateId(), name: 'YouTube', url: 'https://www.youtube.com', description: '動画共有サイト', tags: [] },
                        { id: this.generateId(), name: 'Netflix', url: 'https://www.netflix.com', description: '動画ストリーミング', tags: [] }
                    ]
                },
                {
                    id: this.generateId(),
                    name: 'プライベート',
                    color: '#2196F3',
                    bookmarks: [
                        { id: this.generateId(), name: 'Gmail', url: 'https://mail.google.com', description: 'メール', tags: [] },
                        { id: this.generateId(), name: 'カレンダー', url: 'https://calendar.google.com', description: 'スケジュール管理', tags: [] }
                    ]
                },
                {
                    id: this.generateId(),
                    name: '仕事',
                    color: '#FF5722',
                    bookmarks: [
                        { id: this.generateId(), name: 'Slack', url: 'https://slack.com', description: 'チームコミュニケーション', tags: [] },
                        { id: this.generateId(), name: 'Zoom', url: 'https://zoom.us', description: 'ビデオ会議', tags: [] }
                    ]
                },
                {
                    id: this.generateId(),
                    name: '勉強',
                    color: '#9C27B0',
                    bookmarks: [
                        { id: this.generateId(), name: 'Google', url: 'https://www.google.com', description: '検索エンジン', tags: [] },
                        { id: this.generateId(), name: 'Wikipedia', url: 'https://ja.wikipedia.org', description: 'オンライン百科事典', tags: [] }
                    ]
                }
            ],
            tags: [],
            lastModified: Date.now()
        };
    }

    saveData() {
        try {
            this.data.lastModified = Date.now();
            localStorage.setItem('bookmarkData', JSON.stringify(this.data));
            
            if (window.syncManager && window.syncManager.isEnabled()) {
                const userId = localStorage.getItem('userId');
                if (userId) {
                    window.syncManager.syncToCloud(userId);
                }
            }
        } catch (error) {
            console.error('データの保存エラー:', error);
            alert('データの保存に失敗しました。ストレージの容量を確認してください。');
        }
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // タグ管理メソッド
    addTag(tagName) {
        tagName = tagName.trim();
        if (!tagName) return null;
        
        // 既存のタグをチェック
        const existingTag = this.data.tags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
        if (existingTag) {
            return existingTag;
        }
        
        const newTag = {
            id: this.generateId(),
            name: tagName,
            color: this.getRandomColor()
        };
        
        this.data.tags.push(newTag);
        this.saveData();
        return newTag;
    }

    deleteTag(tagId) {
        this.data.tags = this.data.tags.filter(t => t.id !== tagId);
        
        // 全ブックマークからこのタグを削除
        this.data.categories.forEach(category => {
            category.bookmarks.forEach(bookmark => {
                if (bookmark.tags) {
                    bookmark.tags = bookmark.tags.filter(t => t !== tagId);
                }
            });
        });
        
        this.saveData();
    }

    updateTag(tagId, newName, newColor) {
        const tag = this.data.tags.find(t => t.id === tagId);
        if (tag) {
            tag.name = newName.trim();
            if (newColor) {
                tag.color = newColor;
            }
            this.saveData();
        }
    }

    getTag(tagId) {
        return this.data.tags.find(t => t.id === tagId);
    }

    getAllTags() {
        return this.data.tags;
    }

    getRandomColor() {
        const colors = ['#4CAF50', '#2196F3', '#FF5722', '#9C27B0', '#FF9800', '#795548', '#607D8B', '#E91E63', '#00BCD4'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // カテゴリー管理
    addCategory(name, color) {
        const category = {
            id: this.generateId(),
            name: name,
            color: color || '#4CAF50',
            bookmarks: []
        };
        this.data.categories.push(category);
        this.saveData();
        return category;
    }

    updateCategory(categoryId, name, color) {
        const category = this.data.categories.find(c => c.id === categoryId);
        if (category) {
            category.name = name;
            category.color = color;
            this.saveData();
        }
    }

    deleteCategory(categoryId) {
        this.data.categories = this.data.categories.filter(c => c.id !== categoryId);
        this.saveData();
    }

    getCategory(categoryId) {
        return this.data.categories.find(c => c.id === categoryId);
    }

    // ブックマーク管理（タグ対応）
    addBookmark(categoryId, name, url, description, tags = []) {
        const category = this.getCategory(categoryId);
        if (!category) return null;

        const bookmark = {
            id: this.generateId(),
            name: name,
            url: url,
            description: description || '',
            tags: tags || []
        };

        category.bookmarks.push(bookmark);
        this.saveData();
        return bookmark;
    }

    updateBookmark(categoryId, bookmarkId, name, url, description, tags = []) {
        const category = this.getCategory(categoryId);
        if (!category) return;

        const bookmark = category.bookmarks.find(b => b.id === bookmarkId);
        if (bookmark) {
            bookmark.name = name;
            bookmark.url = url;
            bookmark.description = description || '';
            bookmark.tags = tags || [];
            this.saveData();
        }
    }

    deleteBookmark(categoryId, bookmarkId) {
        const category = this.getCategory(categoryId);
        if (!category) return;

        category.bookmarks = category.bookmarks.filter(b => b.id !== bookmarkId);
        this.saveData();
    }

    // タグでブックマークを検索
    getBookmarksByTag(tagId) {
        const results = [];
        this.data.categories.forEach(category => {
            category.bookmarks.forEach(bookmark => {
                if (bookmark.tags && bookmark.tags.includes(tagId)) {
                    results.push({
                        bookmark: bookmark,
                        category: category
                    });
                }
            });
        });
        return results;
    }

    // データ移行（既存ブックマークにtagsプロパティを追加）
    migrateData() {
        let needsSave = false;
        
        this.data.categories.forEach(category => {
            category.bookmarks.forEach(bookmark => {
                if (!bookmark.tags) {
                    bookmark.tags = [];
                    needsSave = true;
                }
            });
        });
        
        if (needsSave) {
            this.saveData();
        }
    }

    // エクスポート/インポート
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

    importData(jsonData) {
        try {
            const importedData = JSON.parse(jsonData);
            
            // タグリストの初期化
            if (!importedData.tags) {
                importedData.tags = [];
            }
            
            // ブックマークのtagsプロパティを確認
            if (importedData.categories) {
                importedData.categories.forEach(category => {
                    if (category.bookmarks) {
                        category.bookmarks.forEach(bookmark => {
                            if (!bookmark.tags) {
                                bookmark.tags = [];
                            }
                        });
                    }
                });
            }
            
            this.data = importedData;
            this.saveData();
            return true;
        } catch (error) {
            console.error('インポートエラー:', error);
            return false;
        }
    }

    search(query) {
        if (!query) return [];

        const results = [];
        const searchLower = query.toLowerCase();

        this.data.categories.forEach(category => {
            category.bookmarks.forEach(bookmark => {
                if (
                    bookmark.name.toLowerCase().includes(searchLower) ||
                    bookmark.url.toLowerCase().includes(searchLower) ||
                    bookmark.description.toLowerCase().includes(searchLower)
                ) {
                    results.push({
                        bookmark: bookmark,
                        category: category
                    });
                }
            });
        });

        return results;
    }

    // カテゴリー並び替え
    reorderCategories(fromIndex, toIndex) {
        const [removed] = this.data.categories.splice(fromIndex, 1);
        this.data.categories.splice(toIndex, 0, removed);
        this.saveData();
    }

    // ブックマーク並び替え
    reorderBookmarks(categoryId, fromIndex, toIndex) {
        const category = this.getCategory(categoryId);
        if (!category) return;

        const [removed] = category.bookmarks.splice(fromIndex, 1);
        category.bookmarks.splice(toIndex, 0, removed);
        this.saveData();
    }

    updateStats() {
        const categoryCount = this.data.categories.length;
        const bookmarkCount = this.data.categories.reduce((sum, cat) => sum + cat.bookmarks.length, 0);
        
        document.getElementById('categoryCount').textContent = categoryCount;
        document.getElementById('bookmarkCount').textContent = bookmarkCount;
    }
}

// UIマネージャー（タグ機能追加）
class UIManager {
    constructor(bookmarkManager) {
        this.bookmarkManager = bookmarkManager;
        this.currentEditingCategory = null;
        this.currentEditingBookmark = null;
        this.selectedTagFilter = null;
        this.initializeUI();
    }

    initializeUI() {
        this.renderCategories();
        this.setupEventListeners();
        this.bookmarkManager.updateStats();
        this.renderTagFilter();
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
            el.addEventListener('click', () => {
                this.closeCategoryModal();
            });
        });

        // ブックマークモーダル
        document.getElementById('saveBookmarkBtn').addEventListener('click', () => {
            this.saveBookmark();
        });

        document.querySelectorAll('#bookmarkModal .close, #bookmarkModal .cancel').forEach(el => {
            el.addEventListener('click', () => {
                this.closeBookmarkModal();
            });
        });

        // インポート/エクスポート
        document.getElementById('importBtn').addEventListener('click', () => {
            this.showImportModal();
        });

        document.getElementById('exportBtn').addEventListener('click', () => {
            this.bookmarkManager.exportData();
        });

        document.getElementById('confirmImportBtn').addEventListener('click', () => {
            this.importFile();
        });

        document.querySelectorAll('#importModal .close, #importModal .cancel').forEach(el => {
            el.addEventListener('click', () => {
                this.closeImportModal();
            });
        });

        // 検索
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.performSearch(e.target.value);
        });

        // 同期ボタン
        const syncBtn = document.getElementById('syncBtn');
        if (syncBtn) {
            syncBtn.addEventListener('click', async () => {
                await this.toggleSync();
            });
        }
    }

    // タグフィルター表示
    renderTagFilter() {
        const tagFilterArea = document.getElementById('tagFilter');
        if (!tagFilterArea) return;

        const tags = this.bookmarkManager.getAllTags();
        
        let html = '<div class="tag-filter-container">';
        html += '<button class="tag-filter-btn" data-tag="all">全て表示</button>';
        
        tags.forEach(tag => {
            html += `
                <button class="tag-filter-btn" data-tag="${tag.id}" style="background-color: ${tag.color}20; border-color: ${tag.color};">
                    ${this.escapeHtml(tag.name)}
                </button>
            `;
        });
        
        html += '<button class="tag-filter-btn manage-tags" id="manageTagsBtn">🏷️ タグ管理</button>';
        html += '</div>';
        
        tagFilterArea.innerHTML = html;
        
        // フィルターボタンのイベント
        tagFilterArea.querySelectorAll('.tag-filter-btn:not(.manage-tags)').forEach(btn => {
            btn.addEventListener('click', () => {
                const tagId = btn.dataset.tag;
                this.filterByTag(tagId);
                
                // アクティブ表示
                tagFilterArea.querySelectorAll('.tag-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // タグ管理ボタン
        const manageBtn = document.getElementById('manageTagsBtn');
        if (manageBtn) {
            manageBtn.addEventListener('click', () => {
                this.showTagManagementModal();
            });
        }
        
        // デフォルトで「全て表示」を選択
        const allBtn = tagFilterArea.querySelector('[data-tag="all"]');
        if (allBtn) {
            allBtn.classList.add('active');
        }
    }

    // タグでフィルター
    filterByTag(tagId) {
        if (tagId === 'all') {
            this.selectedTagFilter = null;
            this.renderCategories();
        } else {
            this.selectedTagFilter = tagId;
            this.renderFilteredByTag(tagId);
        }
    }

    // タグでフィルターした結果を表示
    renderFilteredByTag(tagId) {
        const results = this.bookmarkManager.getBookmarksByTag(tagId);
        const mainContent = document.getElementById('mainContent');
        
        if (results.length === 0) {
            mainContent.innerHTML = '<div class="no-results">このタグを持つブックマークはありません</div>';
            return;
        }
        
        // タグ名を取得
        const tag = this.bookmarkManager.getTag(tagId);
        const tagName = tag ? tag.name : 'タグ';
        
        let html = `<div class="tag-results"><h2 style="color: ${tag.color};">🏷️ ${this.escapeHtml(tagName)}</h2>`;
        html += '<div class="categories-grid">';
        
        // カテゴリーごとにグループ化
        const groupedByCategory = {};
        results.forEach(result => {
            const catId = result.category.id;
            if (!groupedByCategory[catId]) {
                groupedByCategory[catId] = {
                    category: result.category,
                    bookmarks: []
                };
            }
            groupedByCategory[catId].bookmarks.push(result.bookmark);
        });
        
        // カテゴリーカードを表示
        Object.values(groupedByCategory).forEach(group => {
            html += this.renderCategoryCard(group.category, group.bookmarks);
        });
        
        html += '</div></div>';
        mainContent.innerHTML = html;
        
        // イベントリスナーを再設定
        this.attachCategoryEventListeners();
    }

    // タグ管理モーダル
    showTagManagementModal() {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.id = 'tagManagementModal';
        
        const tags = this.bookmarkManager.getAllTags();
        
        let tagsHtml = '';
        tags.forEach(tag => {
            tagsHtml += `
                <div class="tag-management-item" data-tag-id="${tag.id}">
                    <span class="tag-color" style="background-color: ${tag.color};"></span>
                    <span class="tag-name">${this.escapeHtml(tag.name)}</span>
                    <button class="edit-tag-btn" data-tag-id="${tag.id}">✏️</button>
                    <button class="delete-tag-btn" data-tag-id="${tag.id}">🗑️</button>
                </div>
            `;
        });
        
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h2>🏷️ タグ管理</h2>
                
                <div class="add-tag-section">
                    <input type="text" id="newTagInput" placeholder="新しいタグ名">
                    <button id="addNewTagBtn" class="btn">➕ 追加</button>
                </div>
                
                <div class="tags-list">
                    ${tagsHtml || '<p class="no-tags">タグがまだありません</p>'}
                </div>
                
                <div class="modal-actions">
                    <button class="btn cancel">閉じる</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // イベントリスナー
        modal.querySelector('.close').addEventListener('click', () => {
            modal.remove();
        });
        
        modal.querySelector('.cancel').addEventListener('click', () => {
            modal.remove();
        });
        
        // タグ追加
        modal.querySelector('#addNewTagBtn').addEventListener('click', () => {
            const input = modal.querySelector('#newTagInput');
            const tagName = input.value.trim();
            
            if (!tagName) {
                alert('タグ名を入力してください');
                return;
            }
            
            this.bookmarkManager.addTag(tagName);
            input.value = '';
            modal.remove();
            this.renderTagFilter();
            this.showTagManagementModal();
        });
        
        // タグ削除
        modal.querySelectorAll('.delete-tag-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tagId = btn.dataset.tagId;
                const tag = this.bookmarkManager.getTag(tagId);
                
                if (confirm(`タグ「${tag.name}」を削除しますか？\nこのタグを持つブックマークからも削除されます。`)) {
                    this.bookmarkManager.deleteTag(tagId);
                    modal.remove();
                    this.renderTagFilter();
                    this.renderCategories();
                    this.showTagManagementModal();
                }
            });
        });
        
        // タグ編集
        modal.querySelectorAll('.edit-tag-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tagId = btn.dataset.tagId;
                const tag = this.bookmarkManager.getTag(tagId);
                
                const newName = prompt('新しいタグ名:', tag.name);
                if (newName && newName.trim()) {
                    this.bookmarkManager.updateTag(tagId, newName.trim(), tag.color);
                    modal.remove();
                    this.renderTagFilter();
                    this.renderCategories();
                    this.showTagManagementModal();
                }
            });
        });
    }

    renderCategories() {
        const mainContent = document.getElementById('mainContent');
        const categories = this.bookmarkManager.data.categories;

        if (categories.length === 0) {
            mainContent.innerHTML = '<div class="no-categories">カテゴリーがありません。「➕ カテゴリー追加」から始めましょう！</div>';
            return;
        }

        let html = '<div class="categories-grid">';
        categories.forEach(category => {
            html += this.renderCategoryCard(category);
        });
        html += '</div>';

        mainContent.innerHTML = html;
        this.attachCategoryEventListeners();
    }

    renderCategoryCard(category, filteredBookmarks = null) {
        const bookmarks = filteredBookmarks || category.bookmarks;
        
        let html = `
            <div class="category-card" data-category-id="${category.id}">
                <div class="category-header" style="background-color: ${category.color};" draggable="true">
                    <span class="drag-handle">⋮⋮</span>
                    <h3>${this.escapeHtml(category.name)}</h3>
                    <div class="category-actions">
                        <button class="add-bookmark-btn" data-category-id="${category.id}">➕</button>
                        <button class="edit-category-btn" data-category-id="${category.id}">✏️</button>
                        <button class="delete-category-btn" data-category-id="${category.id}">🗑️</button>
                    </div>
                </div>
                <div class="category-body">
                    <div class="bookmark-list" data-category-id="${category.id}">
        `;

        if (bookmarks.length === 0) {
            html += '<p class="no-bookmarks">ブックマークがありません</p>';
        } else {
            bookmarks.forEach(bookmark => {
                // タグを表示
                let tagsHtml = '';
                if (bookmark.tags && bookmark.tags.length > 0) {
                    tagsHtml = '<div class="bookmark-tags">';
                    bookmark.tags.forEach(tagId => {
                        const tag = this.bookmarkManager.getTag(tagId);
                        if (tag) {
                            tagsHtml += `<span class="bookmark-tag" style="background-color: ${tag.color}20; border-color: ${tag.color};">${this.escapeHtml(tag.name)}</span>`;
                        }
                    });
                    tagsHtml += '</div>';
                }
                
                html += `
                    <div class="bookmark-item" data-bookmark-id="${bookmark.id}" data-category-id="${category.id}" draggable="true">
                        <span class="drag-handle">⋮⋮</span>
                        <div class="bookmark-content">
                            <a href="${this.escapeHtml(bookmark.url)}" target="_blank" rel="noopener noreferrer">
                                ${this.escapeHtml(bookmark.name)}
                            </a>
                            ${tagsHtml}
                        </div>
                        <div class="bookmark-actions">
                            <button class="copy-url-btn" data-url="${this.escapeHtml(bookmark.url)}" title="URLをコピー">📋</button>
                            <button class="edit-bookmark-btn" data-category-id="${category.id}" data-bookmark-id="${bookmark.id}">✏️</button>
                            <button class="delete-bookmark-btn" data-category-id="${category.id}" data-bookmark-id="${bookmark.id}">🗑️</button>
                        </div>
                    </div>
                `;
            });
        }

        html += `
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    attachCategoryEventListeners() {
        // カテゴリー編集
        document.querySelectorAll('.edit-category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const categoryId = btn.dataset.categoryId;
                this.showCategoryModal(categoryId);
            });
        });

        // カテゴリー削除
        document.querySelectorAll('.delete-category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const categoryId = btn.dataset.categoryId;
                const category = this.bookmarkManager.getCategory(categoryId);
                if (confirm(`カテゴリー「${category.name}」を削除しますか？`)) {
                    this.bookmarkManager.deleteCategory(categoryId);
                    this.renderCategories();
                    this.bookmarkManager.updateStats();
                }
            });
        });

        // ブックマーク追加
        document.querySelectorAll('.add-bookmark-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const categoryId = btn.dataset.categoryId;
                this.showBookmarkModal(categoryId);
            });
        });

        // ブックマーク編集
        document.querySelectorAll('.edit-bookmark-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const categoryId = btn.dataset.categoryId;
                const bookmarkId = btn.dataset.bookmarkId;
                this.showBookmarkModal(categoryId, bookmarkId);
            });
        });

        // ブックマーク削除
        document.querySelectorAll('.delete-bookmark-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const categoryId = btn.dataset.categoryId;
                const bookmarkId = btn.dataset.bookmarkId;
                const category = this.bookmarkManager.getCategory(categoryId);
                const bookmark = category.bookmarks.find(b => b.id === bookmarkId);
                if (confirm(`ブックマーク「${bookmark.name}」を削除しますか？`)) {
                    this.bookmarkManager.deleteBookmark(categoryId, bookmarkId);
                    this.renderCategories();
                    this.bookmarkManager.updateStats();
                }
            });
        });

        // URLコピー
        document.querySelectorAll('.copy-url-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const url = btn.dataset.url;
                try {
                    await navigator.clipboard.writeText(url);
                    this.showNotification('URLをコピーしました！', 'success');
                } catch (error) {
                    this.showNotification('コピーに失敗しました', 'error');
                }
            });
        });

        // ドラッグ&ドロップ
        this.setupDragAndDrop();
    }

    setupDragAndDrop() {
        // カテゴリーのドラッグ
        const categoryHeaders = document.querySelectorAll('.category-header');
        categoryHeaders.forEach(header => {
            header.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('type', 'category');
                e.dataTransfer.setData('categoryId', header.closest('.category-card').dataset.categoryId);
                header.closest('.category-card').classList.add('dragging');
            });

            header.addEventListener('dragend', (e) => {
                header.closest('.category-card').classList.remove('dragging');
            });
        });

        // ブックマークのドラッグ
        const bookmarkItems = document.querySelectorAll('.bookmark-item');
        bookmarkItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('type', 'bookmark');
                e.dataTransfer.setData('bookmarkId', item.dataset.bookmarkId);
                e.dataTransfer.setData('categoryId', item.dataset.categoryId);
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', (e) => {
                item.classList.remove('dragging');
            });
        });

        // ドロップゾーン
        const dropZones = document.querySelectorAll('.bookmark-list, .categories-grid');
        dropZones.forEach(zone => {
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });

            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                const type = e.dataTransfer.getData('type');

                if (type === 'category' && zone.classList.contains('categories-grid')) {
                    const draggedId = e.dataTransfer.getData('categoryId');
                    const cards = Array.from(zone.querySelectorAll('.category-card'));
                    const draggedCard = cards.find(c => c.dataset.categoryId === draggedId);
                    const afterCard = this.getDragAfterElement(zone, e.clientX, e.clientY);
                    
                    const fromIndex = cards.indexOf(draggedCard);
                    let toIndex = afterCard ? cards.indexOf(afterCard) : cards.length;
                    
                    this.bookmarkManager.reorderCategories(fromIndex, toIndex);
                    this.renderCategories();
                }

                if (type === 'bookmark' && zone.classList.contains('bookmark-list')) {
                    const bookmarkId = e.dataTransfer.getData('bookmarkId');
                    const categoryId = zone.dataset.categoryId;
                    const items = Array.from(zone.querySelectorAll('.bookmark-item'));
                    const draggedItem = items.find(i => i.dataset.bookmarkId === bookmarkId);
                    const afterItem = this.getDragAfterElement(zone, e.clientX, e.clientY);
                    
                    const fromIndex = items.indexOf(draggedItem);
                    let toIndex = afterItem ? items.indexOf(afterItem) : items.length;
                    
                    this.bookmarkManager.reorderBookmarks(categoryId, fromIndex, toIndex);
                    this.renderCategories();
                }
            });
        });
    }

    getDragAfterElement(container, x, y) {
        const draggableElements = [...container.querySelectorAll('.category-card:not(.dragging), .bookmark-item:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    showCategoryModal(categoryId = null) {
        const modal = document.getElementById('categoryModal');
        const title = modal.querySelector('h2');
        const nameInput = document.getElementById('categoryNameInput');
        const colorInput = document.getElementById('categoryColorInput');

        if (categoryId) {
            const category = this.bookmarkManager.getCategory(categoryId);
            title.textContent = 'カテゴリーを編集';
            nameInput.value = category.name;
            colorInput.value = category.color;
            this.currentEditingCategory = categoryId;
        } else {
            title.textContent = '新しいカテゴリー';
            nameInput.value = '';
            colorInput.value = '#4CAF50';
            this.currentEditingCategory = null;
        }

        modal.classList.add('active');
        nameInput.focus();
    }

    closeCategoryModal() {
        document.getElementById('categoryModal').classList.remove('active');
        this.currentEditingCategory = null;
    }

    saveCategory() {
        const name = document.getElementById('categoryNameInput').value.trim();
        const color = document.getElementById('categoryColorInput').value;

        if (!name) {
            alert('カテゴリー名を入力してください');
            return;
        }

        if (this.currentEditingCategory) {
            this.bookmarkManager.updateCategory(this.currentEditingCategory, name, color);
        } else {
            this.bookmarkManager.addCategory(name, color);
        }

        this.closeCategoryModal();
        this.renderCategories();
        this.bookmarkManager.updateStats();
    }

    showBookmarkModal(categoryId, bookmarkId = null) {
        const modal = document.getElementById('bookmarkModal');
        const title = modal.querySelector('h2');
        const nameInput = document.getElementById('bookmarkNameInput');
        const urlInput = document.getElementById('bookmarkUrlInput');
        const descInput = document.getElementById('bookmarkDescInput');
        
        // タグ選択エリアを作成
        let tagSelectHtml = '<div class="tag-select-area"><h4>🏷️ タグ</h4><div class="tag-checkboxes">';
        const allTags = this.bookmarkManager.getAllTags();
        
        if (allTags.length === 0) {
            tagSelectHtml += '<p class="no-tags">タグがまだありません。<a href="#" id="createTagLink">タグを作成</a></p>';
        } else {
            allTags.forEach(tag => {
                tagSelectHtml += `
                    <label class="tag-checkbox">
                        <input type="checkbox" name="bookmark-tag" value="${tag.id}">
                        <span style="background-color: ${tag.color}20; border-color: ${tag.color};">${this.escapeHtml(tag.name)}</span>
                    </label>
                `;
            });
        }
        tagSelectHtml += '</div></div>';
        
        // タグ選択エリアを挿入
        let tagArea = modal.querySelector('.tag-select-area');
        if (tagArea) {
            tagArea.remove();
        }
        descInput.parentElement.insertAdjacentHTML('afterend', tagSelectHtml);

        if (bookmarkId) {
            const category = this.bookmarkManager.getCategory(categoryId);
            const bookmark = category.bookmarks.find(b => b.id === bookmarkId);
            title.textContent = 'ブックマークを編集';
            nameInput.value = bookmark.name;
            urlInput.value = bookmark.url;
            descInput.value = bookmark.description || '';
            
            // タグを選択状態にする
            if (bookmark.tags && bookmark.tags.length > 0) {
                bookmark.tags.forEach(tagId => {
                    const checkbox = modal.querySelector(`input[value="${tagId}"]`);
                    if (checkbox) {
                        checkbox.checked = true;
                    }
                });
            }
            
            this.currentEditingBookmark = { categoryId, bookmarkId };
        } else {
            title.textContent = '新しいブックマーク';
            nameInput.value = '';
            urlInput.value = '';
            descInput.value = '';
            this.currentEditingBookmark = { categoryId, bookmarkId: null };
        }

        modal.classList.add('active');
        nameInput.focus();
        
        // タグ作成リンクのイベント
        const createTagLink = modal.querySelector('#createTagLink');
        if (createTagLink) {
            createTagLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeBookmarkModal();
                this.showTagManagementModal();
            });
        }
    }

    closeBookmarkModal() {
        document.getElementById('bookmarkModal').classList.remove('active');
        this.currentEditingBookmark = null;
    }

    saveBookmark() {
        const name = document.getElementById('bookmarkNameInput').value.trim();
        const url = document.getElementById('bookmarkUrlInput').value.trim();
        const description = document.getElementById('bookmarkDescInput').value.trim();
        
        // 選択されたタグを取得
        const selectedTags = [];
        document.querySelectorAll('#bookmarkModal input[name="bookmark-tag"]:checked').forEach(checkbox => {
            selectedTags.push(checkbox.value);
        });

        if (!name || !url) {
            alert('名前とURLは必須です');
            return;
        }

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            alert('URLは http:// または https:// で始まる必要があります');
            return;
        }

        const { categoryId, bookmarkId } = this.currentEditingBookmark;

        if (bookmarkId) {
            this.bookmarkManager.updateBookmark(categoryId, bookmarkId, name, url, description, selectedTags);
        } else {
            this.bookmarkManager.addBookmark(categoryId, name, url, description, selectedTags);
        }

        this.closeBookmarkModal();
        
        // フィルター中なら再フィルター
        if (this.selectedTagFilter) {
            this.filterByTag(this.selectedTagFilter);
        } else {
            this.renderCategories();
        }
        
        this.bookmarkManager.updateStats();
    }

    showImportModal() {
        document.getElementById('importModal').classList.add('active');
    }

    closeImportModal() {
        document.getElementById('importModal').classList.remove('active');
        document.getElementById('importFileInput').value = '';
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
            const success = this.bookmarkManager.importData(e.target.result);
            if (success) {
                this.closeImportModal();
                this.renderCategories();
                this.renderTagFilter();
                this.bookmarkManager.updateStats();
                this.showNotification('インポートが完了しました！', 'success');
            } else {
                alert('インポートに失敗しました。ファイルの形式を確認してください。');
            }
        };

        reader.readAsText(file);
    }

    performSearch(query) {
        if (!query) {
            this.renderCategories();
            return;
        }

        const results = this.bookmarkManager.search(query);
        const mainContent = document.getElementById('mainContent');

        if (results.length === 0) {
            mainContent.innerHTML = '<div class="no-results">検索結果が見つかりませんでした</div>';
            return;
        }

        let html = '<div class="search-results"><h2>検索結果</h2><div class="categories-grid">';

        const groupedByCategory = {};
        results.forEach(result => {
            const catId = result.category.id;
            if (!groupedByCategory[catId]) {
                groupedByCategory[catId] = {
                    category: result.category,
                    bookmarks: []
                };
            }
            groupedByCategory[catId].bookmarks.push(result.bookmark);
        });

        Object.values(groupedByCategory).forEach(group => {
            html += this.renderCategoryCard(group.category, group.bookmarks);
        });

        html += '</div></div>';
        mainContent.innerHTML = html;
        this.attachCategoryEventListeners();
    }

    async toggleSync() {
        const userId = localStorage.getItem('userId');
        if (!userId) return;

        if (window.syncManager && window.syncManager.isEnabled()) {
            window.syncManager.disableSync();
            this.updateSyncStatus(false);
            this.showNotification('☁️ クラウド同期を無効にしました', 'info');
        } else {
            const success = await window.syncManager.enableSync(userId);
            if (success) {
                this.updateSyncStatus(true);
                this.showNotification('☁️ クラウド同期が有効になりました！', 'success');
                this.renderCategories();
                this.renderTagFilter();
            } else {
                this.showNotification('❌ 同期の有効化に失敗しました', 'error');
            }
        }
    }

    updateSyncStatus(isSyncing) {
        const statusText = document.getElementById('syncStatus');
        if (statusText) {
            statusText.textContent = isSyncing ? '☁️ クラウド同期中' : '💾 ローカル保存';
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// アプリ初期化
document.addEventListener('DOMContentLoaded', async () => {
    const authManager = new AuthManager();

    // ログイン状態チェック
    if (!authManager.isLoggedIn()) {
        showLoginScreen();
        return;
    }

    // ログイン済みの場合
    initializeApp();
});

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appContent').style.display = 'none';

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const showRegisterBtn = document.getElementById('showRegister');
    const showLoginBtn = document.getElementById('showLogin');

    showRegisterBtn.addEventListener('click', () => {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    });

    showLoginBtn.addEventListener('click', () => {
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
    });

    // ログイン
    document.getElementById('loginBtn').addEventListener('click', async () => {
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const authManager = new AuthManager();
            await authManager.login(username, password);
            location.reload();
        } catch (error) {
            alert(error.message);
        }
    });

    // 新規登録
    document.getElementById('registerBtn').addEventListener('click', async () => {
        const username = document.getElementById('registerUsername').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;

        if (password !== confirmPassword) {
            alert('パスワードが一致しません');
            return;
        }

        try {
            const authManager = new AuthManager();
            await authManager.register(username, password);
            location.reload();
        } catch (error) {
            alert(error.message);
        }
    });
}

async function initializeApp() {
    const authManager = new AuthManager();
    const currentUser = authManager.getCurrentUser();
    const userId = authManager.getUserId();

    // ユーザー表示
    document.getElementById('currentUser').textContent = currentUser;

    // ログアウトボタン
    document.getElementById('logoutBtn').addEventListener('click', () => {
        if (confirm('ログアウトしますか？')) {
            authManager.logout();
            location.reload();
        }
    });

    // アプリ表示
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContent').style.display = 'block';

    // マネージャー初期化
    const bookmarkManager = new BookmarkManager();
    bookmarkManager.migrateData(); // 既存データの移行
    
    window.syncManager = new FirebaseSyncManager(bookmarkManager);
    window.uiManager = new UIManager(bookmarkManager);

    // クラウド同期を自動で有効化
    if (window.firebaseDB && userId) {
        const success = await window.syncManager.enableSync(userId);
        window.uiManager.updateSyncStatus(success);
    }
}
