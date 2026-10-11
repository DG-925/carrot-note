package com.carrotnote.app.data

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.carrotnote.app.Graph
import com.carrotnote.app.reminders.Reminders
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.TimeUnit

data class SyncState(val syncing: Boolean = false, val lastSync: Long = 0, val error: String? = null)

class SyncManager(private val context: Context, private val scope: CoroutineScope) {
    private val mutex = Mutex()
    private var pending: Job? = null

    private val _state = MutableStateFlow(SyncState())
    val state: StateFlow<SyncState> = _state.asStateFlow()

    /** Debounced sync after local edits. */
    fun requestSync(delayMs: Long = 2_500) {
        pending?.cancel()
        pending = scope.launch {
            delay(delayMs)
            syncNow()
        }
    }

    suspend fun syncNow(): Boolean = mutex.withLock {
        val repo = Graph.repoOrNull ?: return false
        val token = Graph.session.token ?: return false
        _state.value = _state.value.copy(syncing = true, error = null)
        try {
            var cursor = repo.syncCursor
            val dirty = repo.dirtyRecords()
            val chunks = if (dirty.isEmpty()) listOf(emptyList()) else dirty.chunked(100)
            for (chunk in chunks) {
                val resp = Graph.api.sync(token, SyncRequest(cursor, chunk))
                if (Graph.repoOrNull !== repo) {
                    _state.value = SyncState()
                    return false
                }
                repo.applyRemote(resp.changes)
                repo.markClean(chunk)
                cursor = resp.cursor
                repo.syncCursor = cursor
                if (resp.changes.any { it.type == "task" || it.type == "event" }) {
                    Reminders.rescheduleAll(context, repo)
                }
            }
            repo.lastSyncAt = nowMs()
            _state.value = SyncState(syncing = false, lastSync = repo.lastSyncAt)
            true
        } catch (e: ApiException) {
            if (e.status == 401) {
                _state.value = SyncState(error = "Session expired. Please sign in again.")
                Graph.forceSignOut()
            } else {
                _state.value = _state.value.copy(syncing = false, error = e.message)
            }
            false
        } catch (e: Exception) {
            _state.value = _state.value.copy(syncing = false, error = e.message ?: "Sync failed")
            false
        }
    }

    fun loadLastSync(repo: Repository) {
        _state.value = SyncState(lastSync = repo.lastSyncAt)
    }

    companion object {
        fun schedulePeriodic(context: Context) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork("carrot_sync", ExistingPeriodicWorkPolicy.KEEP, req)
        }
    }
}

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        if (Graph.repoOrNull == null) return Result.success()
        return if (Graph.sync.syncNow()) Result.success() else Result.retry()
    }
}
