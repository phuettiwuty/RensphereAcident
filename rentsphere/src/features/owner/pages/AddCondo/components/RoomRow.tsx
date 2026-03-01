import ToggleSwitch from "./ToggleSwitch";

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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 10,
      }}
    >
      <input
        value={room.number}
        onChange={(e) => onChangeNumber(e.target.value)}
        title="เลขห้อง"
        placeholder="เลขห้อง"
        style={{
          width: 80,
          height: 32,
          borderRadius: 8,
          border: "1px solid #E5E7EB",
          padding: "0 8px",
        }}
      />

      <ToggleSwitch checked={room.isActive} onChange={onToggle} />

      <span>{room.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>

      <button
        onClick={onDelete}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#999",
          fontSize: 18,
        }}
        title="ลบห้อง"
      >
        🗑
      </button>
    </div>
  );
}
