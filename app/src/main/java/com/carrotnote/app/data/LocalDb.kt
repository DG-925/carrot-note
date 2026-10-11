package com.carrotnote.app.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/** One row per synced record. Data is the JSON of the model; deleted rows are tombstones. */
data class LocalRow(
    val type: String,
    val id: String,
    val data: String?,
    val updatedAt: Long,
    val deleted: Boolean,
    val dirty: Boolean,
)

class LocalDb(context: Context, name: String) : SQLiteOpenHelper(context, name, null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE records (
                type TEXT NOT NULL,
                id TEXT NOT NULL,
                data TEXT,
                updated_at INTEGER NOT NULL,
                deleted INTEGER NOT NULL DEFAULT 0,
                dirty INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (type, id)
            )"""
        )
        db.execSQL("CREATE INDEX idx_records_dirty ON records(dirty)")
        db.execSQL("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    fun all(): List<LocalRow> = query("SELECT type, id, data, updated_at, deleted, dirty FROM records", emptyArray())

    fun dirty(): List<LocalRow> =
        query("SELECT type, id, data, updated_at, deleted, dirty FROM records WHERE dirty = 1", emptyArray())

    fun get(type: String, id: String): LocalRow? =
        query(
            "SELECT type, id, data, updated_at, deleted, dirty FROM records WHERE type = ? AND id = ?",
            arrayOf(type, id),
        ).firstOrNull()

    fun put(row: LocalRow) {
        val cv = ContentValues().apply {
            put("type", row.type)
            put("id", row.id)
            put("data", row.data)
            put("updated_at", row.updatedAt)
            put("deleted", if (row.deleted) 1 else 0)
            put("dirty", if (row.dirty) 1 else 0)
        }
        writableDatabase.insertWithOnConflict("records", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun markClean(type: String, id: String, updatedAt: Long) {
        writableDatabase.execSQL(
            "UPDATE records SET dirty = 0 WHERE type = ? AND id = ? AND updated_at = ?",
            arrayOf(type, id, updatedAt),
        )
    }

    fun transaction(block: () -> Unit) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            block()
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun getMeta(key: String): String? =
        readableDatabase.rawQuery("SELECT value FROM meta WHERE key = ?", arrayOf(key)).use {
            if (it.moveToFirst()) it.getString(0) else null
        }

    fun setMeta(key: String, value: String) {
        val cv = ContentValues().apply { put("key", key); put("value", value) }
        writableDatabase.insertWithOnConflict("meta", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun query(sql: String, args: Array<String>): List<LocalRow> =
        readableDatabase.rawQuery(sql, args).use { c ->
            buildList {
                while (c.moveToNext()) {
                    add(
                        LocalRow(
                            type = c.getString(0),
                            id = c.getString(1),
                            data = if (c.isNull(2)) null else c.getString(2),
                            updatedAt = c.getLong(3),
                            deleted = c.getInt(4) == 1,
                            dirty = c.getInt(5) == 1,
                        )
                    )
                }
            }
        }
}
