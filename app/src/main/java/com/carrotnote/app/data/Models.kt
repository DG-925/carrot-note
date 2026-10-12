package com.carrotnote.app.data

import kotlinx.serialization.Serializable
import java.util.UUID

fun newId(): String = UUID.randomUUID().toString()
fun nowMs(): Long = System.currentTimeMillis()

/** Dates are stored as epoch days (LocalDate.toEpochDay), times as minutes of the day. */

@Serializable
data class InfoItem(val label: String = "", val value: String = "")

@Serializable
data class Project(
    val id: String = newId(),
    val name: String = "",
    val customerId: String? = null,
    val clientName: String = "",
    val price: Double = 0.0,
    val currency: String = "USD",
    val status: String = ProjectStatus.ACTIVE,
    val startDate: Long? = null,
    val deadline: Long? = null,
    val description: String = "",
    val info: List<InfoItem> = emptyList(),
    val billing: String = Billing.FIXED,
    val hourlyRate: Double = 0.0,
    val repo: String = "",
    val createdAt: Long = nowMs(),
)

object Billing {
    const val FIXED = "fixed"
    const val HOURLY = "hourly"
}

object ProjectStatus {
    const val ACTIVE = "active"
    const val ON_HOLD = "on_hold"
    const val DONE = "done"
    const val CANCELLED = "cancelled"
    val all = listOf(ACTIVE, ON_HOLD, DONE, CANCELLED)
    fun label(s: String) = when (s) {
        ACTIVE -> "Active"
        ON_HOLD -> "On hold"
        DONE -> "Done"
        CANCELLED -> "Cancelled"
        else -> s
    }
}

@Serializable
data class TaskItem(
    val id: String = newId(),
    val title: String = "",
    val notes: String = "",
    val projectId: String? = null,
    val dueDate: Long? = null,
    val dueTime: Int? = null,
    val reminder: Boolean = false,
    val done: Boolean = false,
    val priority: Int = 1,
    /** "", "daily", "weekly" or "monthly": a new copy is made when this one is done. */
    val repeat: String = "",
    val createdAt: Long = nowMs(),
)

@Serializable
data class Note(
    val id: String = newId(),
    val title: String = "",
    val body: String = "",
    val checklist: List<CheckItem> = emptyList(),
    val projectId: String? = null,
    val date: Long? = null,
    val pinned: Boolean = false,
    val color: Int = 0,
    val createdAt: Long = nowMs(),
)

object TxnKind {
    const val EXPENSE = "expense"
    const val INCOME = "income"
}

@Serializable
data class Txn(
    val id: String = newId(),
    val kind: String = TxnKind.EXPENSE,
    val amount: Double = 0.0,
    val currency: String = "USD",
    val category: String = "",
    val method: String = "Cash",
    val date: Long = 0,
    val note: String = "",
    val projectId: String? = null,
    val customerId: String? = null,
    val createdAt: Long = nowMs(),
)

@Serializable
data class GoalDeposit(val id: String = newId(), val amount: Double = 0.0, val date: Long = 0, val note: String = "")

@Serializable
data class Goal(
    val id: String = newId(),
    val name: String = "",
    val target: Double = 0.0,
    val currency: String = "USD",
    val deadline: Long? = null,
    val note: String = "",
    val deposits: List<GoalDeposit> = emptyList(),
    val createdAt: Long = nowMs(),
) {
    val saved: Double get() = deposits.sumOf { it.amount }
    val progress: Float get() = if (target <= 0) 0f else (saved / target).toFloat().coerceIn(0f, 1f)
}

@Serializable
data class Customer(
    val id: String = newId(),
    val name: String = "",
    val phone: String = "",
    val email: String = "",
    val company: String = "",
    val notes: String = "",
    val createdAt: Long = nowMs(),
)

object DebtDirection {
    const val OWED_TO_ME = "owed_to_me"
    const val I_OWE = "i_owe"
}

@Serializable
data class DebtPayment(val id: String = newId(), val amount: Double = 0.0, val date: Long = 0, val note: String = "")

@Serializable
data class Debt(
    val id: String = newId(),
    val direction: String = DebtDirection.OWED_TO_ME,
    val person: String = "",
    val customerId: String? = null,
    val amount: Double = 0.0,
    val currency: String = "USD",
    val dueDate: Long? = null,
    val note: String = "",
    val payments: List<DebtPayment> = emptyList(),
    val createdAt: Long = nowMs(),
) {
    val paid: Double get() = payments.sumOf { it.amount }
    val remaining: Double get() = (amount - paid).coerceAtLeast(0.0)
    val settled: Boolean get() = amount > 0 && remaining <= 0.0001
}

@Serializable
data class CalEvent(
    val id: String = newId(),
    val title: String = "",
    val date: Long = 0,
    val time: Int? = null,
    val note: String = "",
    val reminder: Boolean = false,
    val projectId: String? = null,
    val customerId: String? = null,
    val createdAt: Long = nowMs(),
)

object Categories {
    val expense = listOf(
        "Food", "Transport", "Bills", "Rent", "Shopping", "Subscriptions", "Equipment",
        "Internet & Phone", "Health", "Entertainment", "Education", "Family", "Other",
    )
    val income = listOf("Project payment", "Salary", "Freelance", "Bonus", "Refund", "Gift", "Other")
    val methods = listOf("Cash", "Card", "Bank transfer", "USDT", "Crypto", "PayPal", "InstaPay", "Wallet", "Other")
    val currencies = listOf("USD", "EGP", "EUR", "USDT", "GBP", "SAR", "AED", "KWD", "QAR", "TRY")
}

@Serializable
data class CheckItem(val id: String = newId(), val text: String = "", val done: Boolean = false)

/** A block of tracked work time. [end] is null while the timer is running. */
@Serializable
data class TimeEntry(
    val id: String = newId(),
    val projectId: String? = null,
    val start: Long = nowMs(),
    val end: Long? = null,
    val note: String = "",
    val createdAt: Long = nowMs(),
) {
    val running: Boolean get() = end == null
    fun durationMs(now: Long = nowMs()): Long = ((end ?: now) - start).coerceAtLeast(0)
}

/** Monthly spending limit. An empty [category] is the overall budget. */
@Serializable
data class Budget(
    val id: String = newId(),
    val category: String = "",
    val limit: Double = 0.0,
    val currency: String = "USD",
    val createdAt: Long = nowMs(),
)

/** One renewal of a [Rental]: the period it now covers and what was paid each way. */
@Serializable
data class RentalRenewal(
    val id: String = newId(),
    val date: Long = 0,
    val from: Long? = null,
    val to: Long? = null,
    val cost: Double = 0.0,
    val price: Double = 0.0,
    val note: String = "",
)

/**
 * Something rented to a client: a VPS, hosting, a bot, a domain... [cost] is what it costs me and
 * [price] what the client pays, both per [period] ("monthly", "quarterly", "half", "yearly" or
 * "once"). Dates are epoch days; [expiryTime] is minutes of the day, null for midnight.
 */
@Serializable
data class Rental(
    val id: String = newId(),
    val kind: String = "vps",
    val name: String = "",
    val provider: String = "",
    val customerId: String? = null,
    val projectId: String? = null,
    val clientName: String = "",
    val startDate: Long? = null,
    val expiryDate: Long? = null,
    val expiryTime: Int? = null,
    val period: String = "monthly",
    val cost: Double = 0.0,
    val costCurrency: String = "USD",
    val price: Double = 0.0,
    val priceCurrency: String = "USD",
    val reminder: Boolean = true,
    val remindDays: Int = 3,
    val status: String = "active",
    val details: String = "",
    val renewals: List<RentalRenewal> = emptyList(),
    val createdAt: Long = nowMs(),
)

@Serializable
data class SpaceMember(
    val id: String,
    val username: String = "",
    val name: String = "",
    val avatarRev: Int = 0,
    val role: String = "editor",
)

/** A sync space: the user's personal data or a shared project. */
@Serializable
data class SpaceInfo(
    val id: String,
    val kind: String = "personal",
    val projectId: String? = null,
    val ownerId: String = "",
    val role: String = "owner",
    val members: List<SpaceMember> = emptyList(),
    val pending: List<SpaceMember> = emptyList(),
)
