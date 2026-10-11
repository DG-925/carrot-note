package com.carrotnote.app.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.VectorGroup
import androidx.compose.ui.graphics.vector.VectorNode
import androidx.compose.ui.graphics.vector.VectorPath
import androidx.compose.ui.unit.dp
import compose.icons.FontAwesomeIcons
import compose.icons.fontawesomeicons.Brands
import compose.icons.fontawesomeicons.Solid
import compose.icons.fontawesomeicons.brands.Bitcoin
import compose.icons.fontawesomeicons.brands.Github
import compose.icons.fontawesomeicons.brands.Paypal
import compose.icons.fontawesomeicons.brands.Whatsapp
import compose.icons.fontawesomeicons.solid.AddressBook
import compose.icons.fontawesomeicons.solid.ArrowDown
import compose.icons.fontawesomeicons.solid.ArrowLeft
import compose.icons.fontawesomeicons.solid.ArrowUp
import compose.icons.fontawesomeicons.solid.At
import compose.icons.fontawesomeicons.solid.Backspace
import compose.icons.fontawesomeicons.solid.Bars
import compose.icons.fontawesomeicons.solid.Bell
import compose.icons.fontawesomeicons.solid.Bolt
import compose.icons.fontawesomeicons.solid.Briefcase
import compose.icons.fontawesomeicons.solid.Bullseye
import compose.icons.fontawesomeicons.solid.CalendarAlt
import compose.icons.fontawesomeicons.solid.CalendarDay
import compose.icons.fontawesomeicons.solid.Camera
import compose.icons.fontawesomeicons.solid.Car
import compose.icons.fontawesomeicons.solid.ChartBar
import compose.icons.fontawesomeicons.solid.ChartPie
import compose.icons.fontawesomeicons.solid.Check
import compose.icons.fontawesomeicons.solid.CheckCircle
import compose.icons.fontawesomeicons.solid.CheckSquare
import compose.icons.fontawesomeicons.solid.ChevronDown
import compose.icons.fontawesomeicons.solid.ChevronLeft
import compose.icons.fontawesomeicons.solid.ChevronRight
import compose.icons.fontawesomeicons.solid.ClipboardList
import compose.icons.fontawesomeicons.solid.Clock
import compose.icons.fontawesomeicons.solid.Cloud
import compose.icons.fontawesomeicons.solid.Cog
import compose.icons.fontawesomeicons.solid.Coins
import compose.icons.fontawesomeicons.solid.Copy
import compose.icons.fontawesomeicons.solid.CreditCard
import compose.icons.fontawesomeicons.solid.Download
import compose.icons.fontawesomeicons.solid.Edit
import compose.icons.fontawesomeicons.solid.EllipsisH
import compose.icons.fontawesomeicons.solid.Envelope
import compose.icons.fontawesomeicons.solid.ExclamationCircle
import compose.icons.fontawesomeicons.solid.ExternalLinkAlt
import compose.icons.fontawesomeicons.solid.Eye
import compose.icons.fontawesomeicons.solid.EyeSlash
import compose.icons.fontawesomeicons.solid.FileInvoice
import compose.icons.fontawesomeicons.solid.FileInvoiceDollar
import compose.icons.fontawesomeicons.solid.Film
import compose.icons.fontawesomeicons.solid.Fingerprint
import compose.icons.fontawesomeicons.solid.Flag
import compose.icons.fontawesomeicons.solid.Gift
import compose.icons.fontawesomeicons.solid.GraduationCap
import compose.icons.fontawesomeicons.solid.HandHoldingUsd
import compose.icons.fontawesomeicons.solid.Handshake
import compose.icons.fontawesomeicons.solid.Heartbeat
import compose.icons.fontawesomeicons.solid.Home
import compose.icons.fontawesomeicons.solid.Hourglass
import compose.icons.fontawesomeicons.solid.Image
import compose.icons.fontawesomeicons.solid.Inbox
import compose.icons.fontawesomeicons.solid.InfoCircle
import compose.icons.fontawesomeicons.solid.Laptop
import compose.icons.fontawesomeicons.solid.LaptopCode
import compose.icons.fontawesomeicons.solid.Link
import compose.icons.fontawesomeicons.solid.ListUl
import compose.icons.fontawesomeicons.solid.Lock
import compose.icons.fontawesomeicons.solid.MoneyBillWave
import compose.icons.fontawesomeicons.solid.MoneyCheckAlt
import compose.icons.fontawesomeicons.solid.Moon
import compose.icons.fontawesomeicons.solid.Palette
import compose.icons.fontawesomeicons.solid.PaperPlane
import compose.icons.fontawesomeicons.solid.Pen
import compose.icons.fontawesomeicons.solid.Phone
import compose.icons.fontawesomeicons.solid.PiggyBank
import compose.icons.fontawesomeicons.solid.Play
import compose.icons.fontawesomeicons.solid.Plus
import compose.icons.fontawesomeicons.solid.Receipt
import compose.icons.fontawesomeicons.solid.Search
import compose.icons.fontawesomeicons.solid.ShareAlt
import compose.icons.fontawesomeicons.solid.ShieldAlt
import compose.icons.fontawesomeicons.solid.ShoppingBag
import compose.icons.fontawesomeicons.solid.SignOutAlt
import compose.icons.fontawesomeicons.solid.Square
import compose.icons.fontawesomeicons.solid.Star
import compose.icons.fontawesomeicons.solid.StickyNote
import compose.icons.fontawesomeicons.solid.Stop
import compose.icons.fontawesomeicons.solid.Stopwatch
import compose.icons.fontawesomeicons.solid.SyncAlt
import compose.icons.fontawesomeicons.solid.Tag
import compose.icons.fontawesomeicons.solid.Tasks
import compose.icons.fontawesomeicons.solid.Thumbtack
import compose.icons.fontawesomeicons.solid.Times
import compose.icons.fontawesomeicons.solid.TrashAlt
import compose.icons.fontawesomeicons.solid.University
import compose.icons.fontawesomeicons.solid.UndoAlt
import compose.icons.fontawesomeicons.solid.User
import compose.icons.fontawesomeicons.solid.UserCircle
import compose.icons.fontawesomeicons.solid.UserFriends
import compose.icons.fontawesomeicons.solid.UserPlus
import compose.icons.fontawesomeicons.solid.Users
import compose.icons.fontawesomeicons.solid.Utensils
import compose.icons.fontawesomeicons.solid.Wallet
import compose.icons.fontawesomeicons.solid.Wifi

/** Font Awesome icons used across the app. */
object Ico {
    val Menu = FontAwesomeIcons.Solid.Bars.fit()
    val Home = FontAwesomeIcons.Solid.Home.fit()
    val Wallet = FontAwesomeIcons.Solid.Wallet.fit()
    val Project = FontAwesomeIcons.Solid.Briefcase.fit()
    val Note = FontAwesomeIcons.Solid.StickyNote.fit()
    val Calendar = FontAwesomeIcons.Solid.CalendarAlt.fit()
    val Today = FontAwesomeIcons.Solid.CalendarDay.fit()
    val Plus = FontAwesomeIcons.Solid.Plus.fit()
    val User = FontAwesomeIcons.Solid.User.fit()
    val UserCircle = FontAwesomeIcons.Solid.UserCircle.fit()
    val Users = FontAwesomeIcons.Solid.Users.fit()
    val Team = FontAwesomeIcons.Solid.UserFriends.fit()
    val UserPlus = FontAwesomeIcons.Solid.UserPlus.fit()
    val Settings = FontAwesomeIcons.Solid.Cog.fit()
    val Lock = FontAwesomeIcons.Solid.Lock.fit()
    val SignOut = FontAwesomeIcons.Solid.SignOutAlt.fit()
    val Bell = FontAwesomeIcons.Solid.Bell.fit()
    val Search = FontAwesomeIcons.Solid.Search.fit()
    val Github = FontAwesomeIcons.Brands.Github.fit()
    val Whatsapp = FontAwesomeIcons.Brands.Whatsapp.fit()
    val Debt = FontAwesomeIcons.Solid.Handshake.fit()
    val Goal = FontAwesomeIcons.Solid.PiggyBank.fit()
    val Timer = FontAwesomeIcons.Solid.Stopwatch.fit()
    val Play = FontAwesomeIcons.Solid.Play.fit()
    val Stop = FontAwesomeIcons.Solid.Stop.fit()
    val Check = FontAwesomeIcons.Solid.Check.fit()
    val CheckCircle = FontAwesomeIcons.Solid.CheckCircle.fit()
    val CheckSquare = FontAwesomeIcons.Solid.CheckSquare.fit()
    val Square = FontAwesomeIcons.Solid.Square.fit()
    val Trash = FontAwesomeIcons.Solid.TrashAlt.fit()
    val Edit = FontAwesomeIcons.Solid.Edit.fit()
    val Pen = FontAwesomeIcons.Solid.Pen.fit()
    val Share = FontAwesomeIcons.Solid.ShareAlt.fit()
    val Email = FontAwesomeIcons.Solid.Envelope.fit()
    val Phone = FontAwesomeIcons.Solid.Phone.fit()
    val Contacts = FontAwesomeIcons.Solid.AddressBook.fit()
    val Pin = FontAwesomeIcons.Solid.Thumbtack.fit()
    val Back = FontAwesomeIcons.Solid.ArrowLeft.fit()
    val Left = FontAwesomeIcons.Solid.ChevronLeft.fit()
    val Right = FontAwesomeIcons.Solid.ChevronRight.fit()
    val Down = FontAwesomeIcons.Solid.ChevronDown.fit()
    val Close = FontAwesomeIcons.Solid.Times.fit()
    val Camera = FontAwesomeIcons.Solid.Camera.fit()
    val Image = FontAwesomeIcons.Solid.Image.fit()
    val Link = FontAwesomeIcons.Solid.Link.fit()
    val Open = FontAwesomeIcons.Solid.ExternalLinkAlt.fit()
    val Fingerprint = FontAwesomeIcons.Solid.Fingerprint.fit()
    val Shield = FontAwesomeIcons.Solid.ShieldAlt.fit()
    val Moon = FontAwesomeIcons.Solid.Moon.fit()
    val Download = FontAwesomeIcons.Solid.Download.fit()
    val Cloud = FontAwesomeIcons.Solid.Cloud.fit()
    val Sync = FontAwesomeIcons.Solid.SyncAlt.fit()
    val Warning = FontAwesomeIcons.Solid.ExclamationCircle.fit()
    val Clock = FontAwesomeIcons.Solid.Clock.fit()
    val Flag = FontAwesomeIcons.Solid.Flag.fit()
    val Tasks = FontAwesomeIcons.Solid.Tasks.fit()
    val List = FontAwesomeIcons.Solid.ListUl.fit()
    val Info = FontAwesomeIcons.Solid.InfoCircle.fit()
    val ChartPie = FontAwesomeIcons.Solid.ChartPie.fit()
    val ChartBar = FontAwesomeIcons.Solid.ChartBar.fit()
    val Receipt = FontAwesomeIcons.Solid.Receipt.fit()
    val Income = FontAwesomeIcons.Solid.ArrowDown.fit()
    val Expense = FontAwesomeIcons.Solid.ArrowUp.fit()
    val Invoice = FontAwesomeIcons.Solid.FileInvoiceDollar.fit()
    val Tag = FontAwesomeIcons.Solid.Tag.fit()
    val Inbox = FontAwesomeIcons.Solid.Inbox.fit()
    val Target = FontAwesomeIcons.Solid.Bullseye.fit()
    val Backspace = FontAwesomeIcons.Solid.Backspace.fit()
    val Eye = FontAwesomeIcons.Solid.Eye.fit()
    val EyeOff = FontAwesomeIcons.Solid.EyeSlash.fit()
    val Hourglass = FontAwesomeIcons.Solid.Hourglass.fit()
    val Palette = FontAwesomeIcons.Solid.Palette.fit()
    val Send = FontAwesomeIcons.Solid.PaperPlane.fit()
    val At = FontAwesomeIcons.Solid.At.fit()
    val Copy = FontAwesomeIcons.Solid.Copy.fit()
    val Star = FontAwesomeIcons.Solid.Star.fit()
    val Checklist = FontAwesomeIcons.Solid.ClipboardList.fit()
    val Budget = FontAwesomeIcons.Solid.HandHoldingUsd.fit()
    val More = FontAwesomeIcons.Solid.EllipsisH.fit()

    private val categoryIcons: Map<String, ImageVector> = mapOf(
        "Food" to FontAwesomeIcons.Solid.Utensils.fit(),
        "Transport" to FontAwesomeIcons.Solid.Car.fit(),
        "Bills" to FontAwesomeIcons.Solid.FileInvoice.fit(),
        "Rent" to FontAwesomeIcons.Solid.Home.fit(),
        "Shopping" to FontAwesomeIcons.Solid.ShoppingBag.fit(),
        "Subscriptions" to FontAwesomeIcons.Solid.SyncAlt.fit(),
        "Equipment" to FontAwesomeIcons.Solid.Laptop.fit(),
        "Internet & Phone" to FontAwesomeIcons.Solid.Wifi.fit(),
        "Health" to FontAwesomeIcons.Solid.Heartbeat.fit(),
        "Entertainment" to FontAwesomeIcons.Solid.Film.fit(),
        "Education" to FontAwesomeIcons.Solid.GraduationCap.fit(),
        "Family" to FontAwesomeIcons.Solid.Users.fit(),
        "Project payment" to FontAwesomeIcons.Solid.Briefcase.fit(),
        "Salary" to FontAwesomeIcons.Solid.MoneyCheckAlt.fit(),
        "Freelance" to FontAwesomeIcons.Solid.LaptopCode.fit(),
        "Bonus" to FontAwesomeIcons.Solid.Star.fit(),
        "Refund" to FontAwesomeIcons.Solid.UndoAlt.fit(),
        "Gift" to FontAwesomeIcons.Solid.Gift.fit(),
    )

    private val methodIcons: Map<String, ImageVector> = mapOf(
        "Cash" to FontAwesomeIcons.Solid.MoneyBillWave.fit(),
        "Card" to FontAwesomeIcons.Solid.CreditCard.fit(),
        "Bank transfer" to FontAwesomeIcons.Solid.University.fit(),
        "USDT" to FontAwesomeIcons.Solid.Coins.fit(),
        "Crypto" to FontAwesomeIcons.Brands.Bitcoin.fit(),
        "PayPal" to FontAwesomeIcons.Brands.Paypal.fit(),
        "InstaPay" to FontAwesomeIcons.Solid.Bolt.fit(),
        "Wallet" to FontAwesomeIcons.Solid.Wallet.fit(),
    )

    fun category(name: String): ImageVector = categoryIcons[name] ?: FontAwesomeIcons.Solid.Tag.fit()
    fun method(name: String): ImageVector = methodIcons[name] ?: FontAwesomeIcons.Solid.EllipsisH.fit()
}

/**
 * Font Awesome vectors declare their viewport as their size (hundreds of dp). Rebuild them so
 * the longest side is 24dp, which makes them drop-in replacements for Material icons.
 */
private fun ImageVector.fit(): ImageVector {
    val scale = 24f / maxOf(viewportWidth, viewportHeight)
    val b = ImageVector.Builder(
        name = name,
        defaultWidth = (viewportWidth * scale).dp,
        defaultHeight = (viewportHeight * scale).dp,
        viewportWidth = viewportWidth,
        viewportHeight = viewportHeight,
    )
    fun add(node: VectorNode) {
        when (node) {
            is VectorPath -> b.addPath(
                pathData = node.pathData, pathFillType = node.pathFillType, name = node.name,
                fill = node.fill ?: SolidColor(Color.Black), fillAlpha = node.fillAlpha, stroke = node.stroke, strokeAlpha = node.strokeAlpha,
                strokeLineWidth = node.strokeLineWidth, strokeLineCap = node.strokeLineCap, strokeLineJoin = node.strokeLineJoin,
                strokeLineMiter = node.strokeLineMiter, trimPathStart = node.trimPathStart, trimPathEnd = node.trimPathEnd,
                trimPathOffset = node.trimPathOffset,
            )
            is VectorGroup -> {
                b.addGroup(node.name, node.rotation, node.pivotX, node.pivotY, node.scaleX, node.scaleY, node.translationX, node.translationY, node.clipPathData)
                node.forEach(::add)
                b.clearGroup()
            }
        }
    }
    root.forEach(::add)
    return b.build()
}
