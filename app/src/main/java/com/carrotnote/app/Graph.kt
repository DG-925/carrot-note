package com.carrotnote.app

import android.app.Application
import com.carrotnote.app.data.ApiClient
import com.carrotnote.app.data.AuthResponse
import com.carrotnote.app.data.Repository
import com.carrotnote.app.data.Session
import com.carrotnote.app.data.Settings
import com.carrotnote.app.data.SyncManager
import com.carrotnote.app.reminders.Reminders
import com.carrotnote.app.time.TimeTracker
import com.carrotnote.app.security.LockManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Simple service locator for app-wide singletons. */
object Graph {
    lateinit var app: Application
        private set
    lateinit var session: Session
        private set
    lateinit var settings: Settings
        private set
    lateinit var lock: LockManager
        private set
    lateinit var api: ApiClient
        private set
    lateinit var sync: SyncManager
        private set

    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _repo = MutableStateFlow<Repository?>(null)
    val repoFlow: StateFlow<Repository?> = _repo.asStateFlow()
    val repoOrNull: Repository? get() = _repo.value
    val repo: Repository get() = _repo.value ?: error("Not signed in")

    private val _invites = MutableStateFlow(0)
    /** Pending project invitations for the signed-in user. */
    val inviteCount: StateFlow<Int> = _invites.asStateFlow()
    fun setInviteCount(n: Int) {
        _invites.value = n
    }

    fun init(app: Application) {
        this.app = app
        session = Session(app)
        settings = Settings(app)
        lock = LockManager(app)
        api = ApiClient(BuildConfig.API_URL)
        sync = SyncManager(app, scope)
        session.user.value?.let { openRepo(it.id) }
    }

    private fun openRepo(userId: String) {
        val repo = Repository(app, userId)
        repo.onLocalChange = { sync.requestSync() }
        sync.loadLastSync(repo)
        _repo.value = repo
        SyncManager.schedulePeriodic(app)
        sync.requestSync(500)
        TimeTracker.refreshNotification(app)
    }

    fun onSignedIn(auth: AuthResponse) {
        session.signIn(auth.token, auth.user)
        openRepo(auth.user.id)
    }

    /** Signs out locally and removes this user's data from the device. */
    fun signOut() {
        val token = session.token
        if (token != null) scope.launch { runCatching { api.logout(token) } }
        forceSignOut()
    }

    fun forceSignOut() {
        val repo = _repo.value
        _repo.value = null
        session.signOut()
        lock.clear()
        Reminders.cancelAll(app)
        TimeTracker.cancelNotification(app)
        _invites.value = 0
        if (repo != null) {
            repo.close()
            Repository.deleteData(app, repo.userId)
        }
    }
}
