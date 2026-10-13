package com.carrotnote.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.carrotnote.app.Graph
import com.carrotnote.app.R

/** "Pinned note": the newest pinned note (or the newest note), with its checklist. */
class NoteWidget : CarrotWidget() {

    override fun build(context: Context, manager: AppWidgetManager, widgetId: Int): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.widget_note)
        val (_, height) = Widgets.sizeOf(manager, widgetId, 160, 170)
        val notes = Graph.repoOrNull?.notes?.value.orEmpty()
        val note = notes.filter { it.pinned }.maxByOrNull { it.createdAt } ?: notes.maxByOrNull { it.createdAt }
        v.setTextViewText(R.id.n_head, Widgets.t(if (note?.pinned == false) "Latest note" else "Pinned note"))
        if (note == null) {
            v.setOnClickPendingIntent(R.id.n_root, Widgets.openApp(context, "note", 9930))
            v.setTextViewText(R.id.n_title, Widgets.t(if (Graph.repoOrNull == null) "Open Carrot Note to sign in" else "No notes yet"))
            v.setViewVisibility(R.id.n_body, View.GONE)
            return v
        }
        v.setOnClickPendingIntent(R.id.n_root, Widgets.openApp(context, "note-open:" + note.id, 9931))
        v.setTextViewText(R.id.n_title, note.title.ifBlank { note.body.lineSequence().firstOrNull().orEmpty() })
        // Unticked items first, so what's left to do is what shows.
        val checklist = (note.checklist.filter { !it.done } + note.checklist.filter { it.done }).joinToString("\n") { (if (it.done) "☑ " else "☐ ") + it.text }
        val body = listOf(if (note.title.isBlank()) note.body.lines().drop(1).joinToString("\n") else note.body, checklist)
            .filter { it.isNotBlank() }.joinToString("\n").trim()
        v.setViewVisibility(R.id.n_body, if (body.isEmpty()) View.GONE else View.VISIBLE)
        v.setTextViewText(R.id.n_body, body)
        v.setInt(R.id.n_body, "setMaxLines", ((height - 76) / 19).coerceIn(1, 14))
        return v
    }
}
