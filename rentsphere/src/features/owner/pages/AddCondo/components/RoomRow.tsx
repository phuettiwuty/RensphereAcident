import ToggleSwitch from "./ToggleSwitch";
import "./RoomRow.css";

/* ===== types ===== */
type Room = {
  id: string;
  number: string;
  isActive: boolean;
};

type Props = {
  room: Room;
  onToggle: () => void;
  onDelete: () => void;
  onChangeNumber: (value: string) => void;
};

/* ===== component ===== */
export default function RoomRow({ room, onToggle, onDelete, onChangeNumber }: Props) {
  return (
    <div className="room-row">
      <input
        value={room.number}
        onChange={(e) => onChangeNumber(e.target.value)}
        title="เลขห้อง"
        placeholder="เลขห้อง"
        className="room-row__input"
      />

      <ToggleSwitch checked={room.isActive} onChange={onToggle} />

      <span>{room.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>

      <button
        onClick={onDelete}
        className="room-row__delete-btn"
        title="ลบห้อง"
      >
        🗑
      </button>
    </div>
  );
}
